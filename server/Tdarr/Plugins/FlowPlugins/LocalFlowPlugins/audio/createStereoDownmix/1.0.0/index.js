"use strict";
/**
 * Create Stereo Downmix (Dialogue Preserved)
 *
 * Creates a high-quality stereo downmix from surround audio with boosted
 * center channel for dialogue clarity. Adds as additional track, preserves all originals.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.plugin = exports.details = void 0;

var details = function () { return ({
    name: 'Create Stereo Downmix (Dialogue Preserved)',
    description: 'Creates a high-quality stereo downmix from surround audio with boosted center channel for dialogue clarity. Adds as additional track, preserves all originals.',
    style: {
        borderColor: '#6efefc',
    },
    tags: 'audio',
    isStartPlugin: false,
    pType: '',
    requiresVersion: '2.11.01',
    sidebarPosition: -1,
    icon: '',
    inputs: [
        {
            label: 'Audio Bitrate (kbps)',
            name: 'bitrate',
            type: 'string',
            defaultValue: '192',
            inputUI: {
                type: 'dropdown',
                options: ['128', '160', '192', '224', '256', '320'],
            },
            tooltip: 'AAC bitrate for stereo track',
        },
        {
            label: 'Track Title',
            name: 'trackTitle',
            type: 'string',
            defaultValue: 'Stereo (Night Mode)',
            inputUI: {
                type: 'text',
            },
            tooltip: 'Title/label for the new stereo track. Alphanumeric, spaces, and basic punctuation only.',
        },
        {
            label: 'Normalize Audio',
            name: 'normalize',
            type: 'boolean',
            defaultValue: true,
            inputUI: {
                type: 'switch',
            },
            tooltip: 'Apply loudnorm for consistent playback levels',
        },
        {
            label: 'Loudnorm Target (LUFS)',
            name: 'loudnormTarget',
            type: 'string',
            defaultValue: '-16',
            inputUI: {
                type: 'dropdown',
                options: ['-14', '-16', '-18', '-20', '-23', '-24'],
            },
            tooltip: 'Target loudness. -16 is broadcast, -14 is louder for quiet listening, -23/-24 for cinema-like',
        },
        {
            label: 'Audio Encoder',
            name: 'encoder',
            type: 'string',
            defaultValue: 'aac',
            inputUI: {
                type: 'dropdown',
                options: ['aac', 'libfdk_aac', 'aac_at'],
            },
            tooltip: 'AAC encoder to use. Native aac works everywhere, libfdk_aac is higher quality if available',
        },
        {
            label: 'Timeout (minutes)',
            name: 'timeout',
            type: 'string',
            defaultValue: '60',
            inputUI: {
                type: 'dropdown',
                options: ['30', '60', '120', '180'],
            },
            tooltip: 'Maximum time to wait for encoding to complete',
        },
    ],
    outputs: [
        {
            number: 1,
            tooltip: 'Stereo track created successfully',
        },
        {
            number: 2,
            tooltip: 'Error or skipped (no multichannel audio)',
        },
    ],
}); };
exports.details = details;

// Sanitize track title to prevent issues
function sanitizeTrackTitle(title) {
    if (typeof title !== 'string') return 'Stereo';
    // Allow alphanumeric, spaces, hyphens, underscores, parentheses only
    // Explicitly exclude / \ and other path-like characters
    var sanitized = title.replace(/[^a-zA-Z0-9\s\-_()]/g, '');
    // Collapse multiple spaces, trim
    sanitized = sanitized.replace(/\s+/g, ' ').trim();
    // Limit length
    if (sanitized.length > 64) sanitized = sanitized.substring(0, 64);
    return sanitized || 'Stereo';
}

// Validate bitrate is numeric
function validateBitrate(bitrate) {
    var num = parseInt(bitrate, 10);
    if (isNaN(num) || num < 64 || num > 512) {
        return 192;
    }
    return num;
}

// Get pan filter for specific channel layout
function getPanFilter(channels, channelLayout) {
    var layout = (channelLayout || '').toLowerCase();

    // 5.1 variants (6 channels)
    if (channels === 6 || layout.indexOf('5.1') !== -1) {
        return 'pan=stereo|' +
            'FL=0.70*FL+0.70*FC+0.30*SL+0.30*BL+0.25*LFE|' +
            'FR=0.70*FR+0.70*FC+0.30*SR+0.30*BR+0.25*LFE';
    }

    // 7.1 variants (8 channels)
    if (channels === 8 || layout.indexOf('7.1') !== -1) {
        return 'pan=stereo|' +
            'FL=0.70*FL+0.70*FC+0.25*SL+0.20*BL+0.20*LFE|' +
            'FR=0.70*FR+0.70*FC+0.25*SR+0.20*BR+0.20*LFE';
    }

    // 6.1 (7 channels) - has back center (BC or Cb depending on ffmpeg)
    if (channels === 7 || layout.indexOf('6.1') !== -1) {
        return 'pan=stereo|' +
            'FL=0.70*FL+0.70*FC+0.30*SL+0.20*BC+0.20*LFE|' +
            'FR=0.70*FR+0.70*FC+0.30*SR+0.20*BC+0.20*LFE';
    }

    // Quad (4 channels) - no center, no LFE
    if (channels === 4 || layout.indexOf('quad') !== -1 || layout.indexOf('4.0') !== -1) {
        return 'pan=stereo|' +
            'FL=0.80*FL+0.40*SL+0.40*BL|' +
            'FR=0.80*FR+0.40*SR+0.40*BR';
    }

    // 3.0 (3 channels) - L, R, C
    if (channels === 3) {
        return 'pan=stereo|' +
            'FL=0.70*FL+0.70*FC|' +
            'FR=0.70*FR+0.70*FC';
    }

    // For complex layouts (Atmos, etc), let ffmpeg's internal downmixer handle it
    if (channels > 8) {
        return 'aformat=channel_layouts=stereo';
    }

    // Generic fallback
    return 'pan=stereo|' +
        'FL=0.70*FL+0.70*FC+0.30*SL+0.30*BL+0.25*LFE|' +
        'FR=0.70*FR+0.70*FC+0.30*SR+0.30*BR+0.25*LFE';
}

// Clean up orphaned files from previous runs
function cleanupOrphanedFiles(fs, dir, prefix, maxAgeMs) {
    try {
        if (!fs.existsSync(dir)) return;
        var files = fs.readdirSync(dir);
        var now = Date.now();
        for (var i = 0; i < files.length; i++) {
            var file = files[i];
            if (file.indexOf(prefix) === 0) {
                try {
                    var filePath = dir + '/' + file;
                    var stat = fs.statSync(filePath);
                    if (now - stat.mtimeMs > maxAgeMs) {
                        fs.unlinkSync(filePath);
                    }
                } catch (e) {
                    // Ignore individual file cleanup errors
                }
            }
        }
    } catch (e) {
        // Ignore cleanup errors - non-critical
    }
}

// Acquire a lock file, returns true if acquired
function acquireLock(fs, lockFile, timeoutMs, spawnSync) {
    var start = Date.now();

    while (Date.now() - start < timeoutMs) {
        try {
            // O_CREAT | O_EXCL - atomic create, fails if exists
            fs.writeFileSync(lockFile, String(process.pid) + '\n' + Date.now(), { flag: 'wx' });
            return true;
        } catch (e) {
            if (e.code === 'EEXIST') {
                // Check if lock is stale (older than 2 hours)
                try {
                    var stat = fs.statSync(lockFile);
                    if (Date.now() - stat.mtimeMs > 2 * 60 * 60 * 1000) {
                        try {
                            fs.unlinkSync(lockFile);
                        } catch (unlinkErr) {
                            // Someone else may have removed it
                        }
                        continue; // Retry immediately
                    }
                } catch (statErr) {
                    // Lock file disappeared, retry immediately
                    continue;
                }
                // Lock is held by another process, sleep before retry (not busy-wait)
                spawnSync('sleep', ['0.5'], { timeout: 2000 });
            } else {
                // Permission error or other issue
                return false;
            }
        }
    }
    return false;
}

function releaseLock(fs, lockFile) {
    try {
        fs.unlinkSync(lockFile);
    } catch (e) {
        // Ignore - may already be gone
    }
}

// Safe file delete helper
function safeUnlink(fs, filePath) {
    try {
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
    } catch (e) {
        // Ignore
    }
}

var plugin = function (args) {
    var fs = require('fs');
    var path = require('path');
    var crypto = require('crypto');
    var spawn = require('child_process').spawnSync;

    var lib = require('../../../../../methods/lib')();

    // Wrap loadDefaultValues in try-catch
    try {
        args.inputs = lib.loadDefaultValues(args.inputs, details);
    } catch (e) {
        args.jobLog('ERROR: Failed to load default values: ' + e.message);
        return { outputFileObj: args.inputFileObj, outputNumber: 2, variables: args.variables };
    }

    // Parse and validate inputs
    var bitrate = validateBitrate(args.inputs.bitrate);
    var trackTitle = sanitizeTrackTitle(args.inputs.trackTitle);
    var normalize = args.inputs.normalize === true || args.inputs.normalize === 'true';
    var loudnormTarget = parseInt(args.inputs.loudnormTarget, 10) || -16;
    var encoder = String(args.inputs.encoder || 'aac');
    var timeoutMs = (parseInt(args.inputs.timeout, 10) || 60) * 60 * 1000;

    // Validate encoder choice (ES5-compatible)
    var validEncoders = ['aac', 'libfdk_aac', 'aac_at'];
    if (validEncoders.indexOf(encoder) === -1) {
        encoder = 'aac';
    }

    var inputFile = args.inputFileObj._id || args.inputFileObj.file;
    if (!inputFile) {
        args.jobLog('ERROR: Could not determine input file path');
        return { outputFileObj: args.inputFileObj, outputNumber: 2, variables: args.variables };
    }

    // Use TDarr's work directory, fall back to /temp
    var workDir = args.workDir || '/temp';

    // Cleanup orphaned temp files older than 4 hours
    cleanupOrphanedFiles(fs, workDir, 'stereo_', 4 * 60 * 60 * 1000);

    // Generate unique ID using crypto
    var uniqueId;
    if (typeof crypto.randomUUID === 'function') {
        uniqueId = crypto.randomUUID();
    } else {
        uniqueId = crypto.randomBytes(16).toString('hex');
    }

    var tempFile = path.join(workDir, 'stereo_' + uniqueId + '.mkv');
    // Lock file in workDir to avoid issues with read-only media directories
    var inputBasename = path.basename(inputFile);
    var lockFile = path.join(workDir, inputBasename + '.stereodownmix.lock');
    var backupFile = inputFile + '.backup_' + uniqueId;

    // Track files we need to clean up
    var filesToCleanup = [tempFile];

    // Cleanup helper that handles all cases
    var cleanup = function(exitCode, additionalFiles) {
        releaseLock(fs, lockFile);
        // Clean up temp files
        for (var i = 0; i < filesToCleanup.length; i++) {
            safeUnlink(fs, filesToCleanup[i]);
        }
        if (additionalFiles) {
            for (var j = 0; j < additionalFiles.length; j++) {
                safeUnlink(fs, additionalFiles[j]);
            }
        }
        return { outputFileObj: args.inputFileObj, outputNumber: exitCode, variables: args.variables };
    };

    // Acquire lock to prevent concurrent processing
    args.jobLog('Acquiring lock for: ' + path.basename(inputFile));
    if (!acquireLock(fs, lockFile, 30000, spawn)) {
        args.jobLog('ERROR: Could not acquire lock - file may be processed by another worker');
        return { outputFileObj: args.inputFileObj, outputNumber: 2, variables: args.variables };
    }

    // Validate ffProbeData exists
    if (!args.inputFileObj.ffProbeData || !args.inputFileObj.ffProbeData.streams) {
        args.jobLog('ERROR: No ffprobe data available');
        return cleanup(2);
    }

    var streams = args.inputFileObj.ffProbeData.streams;
    if (!Array.isArray(streams)) {
        args.jobLog('ERROR: ffprobe streams is not an array');
        return cleanup(2);
    }

    // Find main audio stream: prefer default disposition, fallback to first audio
    var mainAudio = null;
    var mainAudioIndex = -1;
    var firstAudio = null;
    var firstAudioIndex = -1;
    var audioStreamCount = 0;

    for (var i = 0; i < streams.length; i++) {
        var stream = streams[i];
        if (stream.codec_type === 'audio') {
            if (firstAudio === null) {
                firstAudio = stream;
                firstAudioIndex = audioStreamCount;
            }
            // Check for default disposition (can be 1, true, or "1")
            var isDefault = stream.disposition && (
                stream.disposition.default === 1 ||
                stream.disposition.default === true ||
                stream.disposition.default === '1'
            );
            if (!mainAudio && isDefault) {
                mainAudio = stream;
                mainAudioIndex = audioStreamCount;
            }
            audioStreamCount++;
        }
    }

    var targetAudio = mainAudio || firstAudio;
    var targetAudioIndex = mainAudio ? mainAudioIndex : firstAudioIndex;
    var selectionMethod = mainAudio ? 'default disposition' : 'first in order';

    if (!targetAudio) {
        args.jobLog('No audio stream found');
        return cleanup(2);
    }

    var channels = targetAudio.channels;
    if (typeof channels !== 'number' || !isFinite(channels) || channels < 1) {
        args.jobLog('ERROR: Invalid channel count in audio stream: ' + channels);
        return cleanup(2);
    }

    var channelLayout = targetAudio.channel_layout || '';
    args.jobLog('Main audio (' + selectionMethod + '): ' +
        (targetAudio.codec_name || 'unknown') + ' with ' + channels +
        ' channels, layout: ' + (channelLayout || 'unspecified'));

    if (channels <= 2) {
        args.jobLog('Audio is already stereo or mono, skipping');
        return cleanup(2);
    }

    // Build filter chain - CORRECT ORDER: pan -> normalize -> limit
    var panFilter = getPanFilter(channels, channelLayout);
    var audioFilter = panFilter;

    if (normalize) {
        audioFilter += ',loudnorm=I=' + loudnormTarget + ':TP=-1.5:LRA=11';
    }

    // Limiter AFTER normalization to catch any peaks
    audioFilter += ',alimiter=limit=0.95';

    args.jobLog('Audio filter chain: ' + audioFilter);

    // Calculate the new stereo track index
    var newStereoIndex = audioStreamCount;
    args.jobLog('New stereo track will be audio stream index: ' + newStereoIndex);

    // Get ffmpeg path (ES5-compatible null checks)
    var ffmpegCli = args.ffmpegPath;
    if (!ffmpegCli && args.deps && args.deps.ffmpegPath) {
        ffmpegCli = args.deps.ffmpegPath;
    }
    if (!ffmpegCli) {
        ffmpegCli = 'tdarr-ffmpeg';
    }

    // Build ffmpeg command
    var spawnArgs = [
        '-y',
        '-i', inputFile,
        '-filter_complex', '[0:a:' + targetAudioIndex + ']' + audioFilter + '[stereo]',
        '-map', '0:v?',
        '-map', '0:a',
        '-map', '[stereo]',
        '-map', '0:s?',
        '-map', '0:t?',
        '-c:v', 'copy',
        '-c:a', 'copy',
        '-c:s', 'copy',
        '-c:t', 'copy',
        '-c:a:' + newStereoIndex, encoder,
        '-b:a:' + newStereoIndex, bitrate + 'k',
        '-ac:a:' + newStereoIndex, '2',
        '-disposition:a:' + newStereoIndex, '0',
        '-metadata:s:a:' + newStereoIndex, 'title=' + trackTitle,
        tempFile
    ];

    args.jobLog('Executing: ' + ffmpegCli + ' [' + spawnArgs.length + ' args]');
    args.jobLog('Input: ' + path.basename(inputFile));
    args.jobLog('Timeout: ' + (timeoutMs / 60000) + ' minutes');

    // Execute ffmpeg with timeout
    var startTime = Date.now();
    var result = spawn(ffmpegCli, spawnArgs, {
        encoding: 'utf8',
        maxBuffer: 50 * 1024 * 1024,
        timeout: timeoutMs
    });

    var elapsed = Math.round((Date.now() - startTime) / 1000);
    args.jobLog('FFmpeg completed in ' + elapsed + ' seconds');

    if (result.status !== 0) {
        var errorOutput = (result.stderr || '').slice(-5000);
        args.jobLog('FFmpeg error (exit code ' + result.status + '):');
        args.jobLog(errorOutput);
        if (result.error) {
            args.jobLog('Spawn error: ' + result.error.message);
        }
        return cleanup(2);
    }

    // Verify output file exists and has reasonable size
    var inputStats, outputStats;
    try {
        inputStats = fs.statSync(inputFile);
        outputStats = fs.statSync(tempFile);
    } catch (e) {
        args.jobLog('ERROR: Could not stat files: ' + e.message);
        return cleanup(2);
    }

    // Adaptive minimum size validation
    // Use duration-based estimate if available, otherwise percentage-based
    var minOutputSize;
    var duration = 0;
    if (args.inputFileObj.ffProbeData && args.inputFileObj.ffProbeData.format) {
        duration = parseFloat(args.inputFileObj.ffProbeData.format.duration) || 0;
    }

    if (duration > 0) {
        // Estimate: duration (sec) * bitrate (kbps) / 8 * 1024 = bytes
        // Use 50% of expected size as minimum to account for VBR/silence
        var expectedBytes = (duration * bitrate * 1024) / 8;
        minOutputSize = Math.max(1 * 1024 * 1024, expectedBytes * 0.5); // At least 1MB
    } else {
        // Fallback: at least 1MB or 5% of input (lowered from 10MB/10%)
        minOutputSize = Math.max(1 * 1024 * 1024, inputStats.size * 0.05);
    }

    if (outputStats.size < minOutputSize) {
        args.jobLog('ERROR: Output too small (' +
            Math.round(outputStats.size / 1024 / 1024) + 'MB vs min ' +
            Math.round(minOutputSize / 1024 / 1024) + 'MB)');
        return cleanup(2);
    }

    args.jobLog('Output size: ' + Math.round(outputStats.size / 1024 / 1024) +
        ' MB (input: ' + Math.round(inputStats.size / 1024 / 1024) + ' MB)');

    // Verify the new stereo track exists via ffprobe
    var ffprobeCli;
    if (args.deps && args.deps.ffprobePath) {
        ffprobeCli = args.deps.ffprobePath;
    } else if (ffmpegCli.indexOf('ffmpeg') !== -1) {
        ffprobeCli = ffmpegCli.replace('ffmpeg', 'ffprobe');
    } else {
        ffprobeCli = 'tdarr-ffprobe';
    }

    var verifyArgs = ['-v', 'quiet', '-print_format', 'json', '-show_streams', '-select_streams', 'a', tempFile];
    var verifyResult = spawn(ffprobeCli, verifyArgs, { encoding: 'utf8', timeout: 60000 });

    if (verifyResult.status !== 0) {
        args.jobLog('ERROR: ffprobe verification failed (exit ' + verifyResult.status + ')');
        args.jobLog('Tried: ' + ffprobeCli);
        if (verifyResult.stderr) {
            args.jobLog('stderr: ' + verifyResult.stderr.slice(0, 500));
        }
        return cleanup(2);
    }

    var verificationPassed = false;
    try {
        var probeData = JSON.parse(verifyResult.stdout);
        var audioStreams = probeData.streams || [];
        var lastAudio = audioStreams[audioStreams.length - 1];

        if (lastAudio && lastAudio.channels === 2) {
            // All AAC encoders produce codec_name === 'aac'
            if (lastAudio.codec_name === 'aac') {
                args.jobLog('Verified: Last audio is AAC stereo');
                verificationPassed = true;
            } else {
                args.jobLog('ERROR: Last audio codec is ' + lastAudio.codec_name + ', expected aac');
            }
        } else {
            args.jobLog('ERROR: Last audio is not stereo (channels: ' +
                (lastAudio ? lastAudio.channels : 'none') + ')');
        }
    } catch (e) {
        args.jobLog('ERROR: Could not parse ffprobe output: ' + e.message);
    }

    if (!verificationPassed) {
        return cleanup(2);
    }

    args.jobLog('Performing file replacement...');

    // File replacement strategy:
    // 1. Rename original to backup (fast, atomic on same FS)
    // 2. Rename temp to original location (fast if same FS, copy+delete if cross-FS)
    // 3. Delete backup on success
    // 4. Restore backup on failure

    try {
        // Step 1: Move original to backup
        fs.renameSync(inputFile, backupFile);
        args.jobLog('Created backup');
        filesToCleanup.push(backupFile); // Track for cleanup on error

        try {
            // Step 2: Move temp to original location
            // Try rename first (works if same filesystem)
            try {
                fs.renameSync(tempFile, inputFile);
                args.jobLog('Moved temp to original location (same filesystem)');
            } catch (renameErr) {
                // Cross-filesystem, need to copy then delete
                args.jobLog('Cross-filesystem move, copying...');
                fs.copyFileSync(tempFile, inputFile);
                fs.unlinkSync(tempFile);
                args.jobLog('Copied and cleaned up temp file');
            }

            // Step 3: Success - remove backup
            safeUnlink(fs, backupFile);
            // Remove from cleanup list since we handled it
            var backupIdx = filesToCleanup.indexOf(backupFile);
            if (backupIdx !== -1) filesToCleanup.splice(backupIdx, 1);

            args.jobLog('File replaced successfully');

        } catch (moveErr) {
            // Step 2 failed - restore backup
            args.jobLog('ERROR during move: ' + moveErr.message);
            args.jobLog('Restoring from backup...');
            try {
                safeUnlink(fs, inputFile); // Remove partial if exists
                fs.renameSync(backupFile, inputFile);
                args.jobLog('Restored original from backup');
                // Remove backup from cleanup list since we restored it
                var idx = filesToCleanup.indexOf(backupFile);
                if (idx !== -1) filesToCleanup.splice(idx, 1);
            } catch (restoreErr) {
                args.jobLog('CRITICAL: Restore failed: ' + restoreErr.message);
                args.jobLog('Backup location: ' + backupFile);
                // Don't remove from cleanup - leave backup file alone
                var bIdx = filesToCleanup.indexOf(backupFile);
                if (bIdx !== -1) filesToCleanup.splice(bIdx, 1);
            }
            return cleanup(2);
        }

    } catch (backupErr) {
        args.jobLog('ERROR creating backup: ' + backupErr.message);
        return cleanup(2);
    }

    releaseLock(fs, lockFile);
    args.jobLog('SUCCESS: Stereo downmix track added');

    return {
        outputFileObj: Object.assign({}, args.inputFileObj, { _id: inputFile }),
        outputNumber: 1,
        variables: args.variables,
    };
};
exports.plugin = plugin;
