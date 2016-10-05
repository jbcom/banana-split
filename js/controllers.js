'use strict';

function showLoading() {
	$('.loading .modal').modal('show');
}

function hideLoading() {
	$('.loading .modal').modal('hide');
}

bananaSplit.controller('BananaSplitMainCtrl', function( $sce, $rootScope, $scope, BananaSplit, $routeParams, $location ) {

	if ( $rootScope.currentDirectory === undefined ) {
		$rootScope.currentDirectory = '/';
	}

	$scope.loadQueue = function() {
		$rootScope.queue = JSON.parse(localStorage.getItem('queue'));
	}

	$scope.saveQueue = function() {
		localStorage.setItem('queue', JSON.stringify($rootScope.queue));
	}

	$scope.loadQueue();

	if ( $rootScope.queue === undefined || $rootScope.queue === null ) {
		$rootScope.queue = [];
	}

	$scope.queueVisible = false;

	$scope.toggleQueue = function() {
		$('body, #queue').toggleClass('slide');
	}	

	$scope.browseDirectory = function() {

		var response = BananaSplit.browseDirectory($rootScope.currentDirectory);

		$rootScope.directoryList = {};
		$rootScope.directoryList.directory = response.directory;
		$rootScope.directoryList.files = [];

		response.files.forEach(function(file) {
			if ( file.name.indexOf('.') != 0 ) {
				$rootScope.directoryList.files.push(file);
			}

			if ( file.name == '..' ) {
				$rootScope.directoryList.parentDirectory = file;
			}
		});
	}

	$scope.openFile = function( file ) {
		showLoading();
		$rootScope.currentVideo = file;
		$location.path('/split');
	}

	$scope.$watch('currentDirectory', function() {
		$scope.browseDirectory();
	});

})

.controller('BananaSplitSplitCtrl', function( $sce, $rootScope, $scope, BananaSplit, $routeParams ) {

	$scope.console = ['Running video through ffmpeg\'s black frame detection...'];

	$scope.gap = 2;

	$scope.currentSplit = 0;
	$scope.currentTime = '100%';
	$scope.splits = [];
	$scope.segments = [];
	$scope.processes = [];

	$scope.thumbnail = function(gapModifier) {
		if ( $scope.blackdetect != undefined ) {
			var file = $rootScope.currentVideo.path;
			var time = $scope.blackdetect[$scope.currentSplit].black_middle + ($scope.gap * gapModifier);

			return BananaSplit.getThumbnail(file, time);
		}
	}

	$scope.regenerateThumbnails = function() {
		showLoading();

		if ($scope.processes.length > 0) {
			for (let process of $scope.processes) {
				console.log(process);
				if (typeof process.kill === 'function') {
					process.kill();
				}
			}
		}

		$scope.processes = [];

		$('.frame-thumbnail').each((i, thumbnail) => {
			if ($scope.blackdetect != undefined) {
				var modifier = parseInt($(thumbnail).attr('modifier'));

				var file = $rootScope.currentVideo.path;
				var time = $scope.blackdetect[$scope.currentSplit].black_middle + ($scope.gap * modifier);

				var thumbnailProcess = BananaSplit.generateThumbnail(file, time).then((process) => {
					$(thumbnail).attr('src', BananaSplit.getThumbnail(time));
				});

				$scope.processes.push(thumbnailProcess.childProcess);
			}
		});

		hideLoading();
	}

	$scope.setCurrentTime = function() {
		$scope.currentTime = ( $scope.blackdetect[$scope.currentSplit].black_middle / $scope.duration.in_seconds ) * 100;
		$scope.currentTime = $scope.currentTime + "%";

		clearTimeout($scope.thumbnailGenTimeout);

		$scope.thumbnailGenTimeout = setTimeout(function() {
			$scope.regenerateThumbnails();
		}, 500);
	}

	$scope.nextSplit = function() {
		if ( $scope.currentSplit != $scope.blackdetect.length - 1 ) {
			$scope.currentSplit = $scope.currentSplit + 1;
			$scope.setCurrentTime();
		}
	}

	$scope.prevSplit = function() {
		if ( $scope.currentSplit != 0 ) {
			$scope.currentSplit = $scope.currentSplit - 1;
			$scope.setCurrentTime();
		}
	}

	$scope.gotoSplit = function(index) {
		$scope.currentSplit = index;
		$scope.setCurrentTime();
	}

	$scope.addSplit = function() {
		$scope.splits.push($scope.blackdetect[$scope.currentSplit].black_end);
		$scope.createSegments();
	}

	$scope.removeSplit = function(splitindex) {
		$scope.splits.splice(splitindex, 1);
		$scope.createSegments();
	}

	$scope.createSegments = function() {
		$scope.segments = [];

		if ( $scope.splits.length > 0 ) {
			var keyframes = [];
			keyframes[0] = 0;
			keyframes = keyframes.concat($scope.splits);
			keyframes.push($scope.duration.in_seconds);

			for ( var i = 0; i < keyframes.length - 1; i++ ) {
				var currentSegment = {
					start: keyframes[i],
					end: keyframes[i + 1],
					encoding: false
				}

				$scope.segments.push(currentSegment);
			}

		}
	}

	$scope.addSegmentToQueue = function(segment, index) {
		segment.name = $rootScope.currentVideo.name;
		segment.path = $rootScope.currentVideo.path;
		segment.status = 'pending';
		$rootScope.queue.push(segment);

		$scope.segments[index].inQueue = true;

		$scope.saveQueue();
	}

	BananaSplit.detectSplits($rootScope.currentVideo.path).then((data) => {
		var stderr = data.stderr.split('\r');

		var output = {
			blackdetect: [],
			duration: [],
			ffmpeg_output: stderr
		}

		// Go through each line
		for (let line of stderr) {
			line = line.trim();

			// If it's a blackdetect line, format it and add it to output
			if (line.indexOf('[blackdetect @') === 0) {
				output.blackdetect.push(BananaSplit.formatBlackDetectLine(line));
			}

			// If it's a line starting with duration, let's format the duration
			if (line.indexOf('Duration:') === 0) {
				output.duration = BananaSplit.formatDurationLine(line);
			}
		}

		$scope.console = output.ffmpeg_output;
		$scope.blackdetect = output.blackdetect;
		$scope.duration = output.duration;

		$scope.blackdetect.forEach(function(black) {
			black.black_start = parseFloat(black.black_start);
			black.black_end = parseFloat(black.black_end);
			black.black_duration = parseFloat(black.black_duration);

			black.black_middle = black.black_start + (black.black_duration / 2);
		});

		$scope.setCurrentTime();
		$scope.gotoSplit(0);

	});

})

.controller('BananaSplitQueueCtrl', function( $sce, $rootScope, $scope, BananaSplit, $routeParams ) {

	$scope.removeAllFromQueue = function() {
		$rootScope.queue = [];
		$scope.saveQueue();
	}

	$scope.removeFromQueue = function(index) {
		$rootScope.queue.splice(index, 1);
		$scope.saveQueue();
	}

	$scope.startQueue = function() {
		$scope.currentQueueIndex = 0;

		$rootScope.queue.forEach(function(segment) {
			if (segment.status != 'pending') {
				$scope.currentQueueIndex++;
			}
		});

		$rootScope.encodingSegment = $rootScope.queue[$scope.currentQueueIndex];
		$scope.segmentVideo();
	}

	$scope.segmentVideo = function() {
		$rootScope.encodingSegment.status = 'encoding';

		BananaSplit.splitVideo($rootScope.encodingSegment);

		$rootScope.encodingSegment.status = 'complete';

		if ( $scope.currentQueueIndex + 1 < $rootScope.queue.length ) {
			$scope.currentQueueIndex++;
			$rootScope.encodingSegment = $rootScope.queue[$scope.currentQueueIndex];

			$scope.saveQueue();

			$scope.segmentVideo();
		}
	}

});