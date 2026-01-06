"use strict";
/**
 * Check Main Audio Stream Channels
 *
 * Determines if the main audio stream is stereo, multichannel, or mono.
 * Main audio is determined by:
 *   1. First audio stream with default disposition flag
 *   2. Falls back to first audio stream if no default is set
 *
 * Fixes applied:
 * - Accurate description matching actual behavior
 * - Proper validation of streams array
 * - Default case in switch
 * - Handling of invalid channel counts
 * - Clear logging of selection logic
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.plugin = exports.details = void 0;

var details = function () { return ({
    name: 'Check Main Audio Stream Channels',
    description: 'Check if the main audio stream is stereo, multichannel (>2ch), or mono. Prefers stream with default disposition, falls back to first audio stream.',
    style: {
        borderColor: 'orange',
    },
    tags: 'audio',
    isStartPlugin: false,
    pType: '',
    requiresVersion: '2.11.01',
    sidebarPosition: -1,
    icon: 'faQuestion',
    inputs: [
        {
            label: 'Condition',
            name: 'condition',
            type: 'string',
            defaultValue: 'multichannel',
            inputUI: {
                type: 'dropdown',
                options: [
                    'stereo',
                    'multichannel',
                    'mono',
                ],
            },
            tooltip: 'Check if main audio stream is: stereo (2ch), multichannel (>2ch), or mono (1ch)',
        },
    ],
    outputs: [
        {
            number: 1,
            tooltip: 'Main audio stream matches condition',
        },
        {
            number: 2,
            tooltip: 'Main audio stream does not match condition (or no audio found)',
        },
    ],
}); };
exports.details = details;

var plugin = function (args) {
    var lib = require('../../../../../methods/lib')();

    // Wrap loadDefaultValues in try-catch
    try {
        args.inputs = lib.loadDefaultValues(args.inputs, details);
    } catch (e) {
        args.jobLog('ERROR: Failed to load default values: ' + e.message);
        return {
            outputFileObj: args.inputFileObj,
            outputNumber: 2,
            variables: args.variables,
        };
    }

    var condition = String(args.inputs.condition || 'multichannel');

    // Validate condition (ES5-compatible)
    var validConditions = ['stereo', 'multichannel', 'mono'];
    if (validConditions.indexOf(condition) === -1) {
        args.jobLog('ERROR: Invalid condition "' + condition + '", must be stereo/multichannel/mono');
        return {
            outputFileObj: args.inputFileObj,
            outputNumber: 2,
            variables: args.variables,
        };
    }

    // Validate ffProbeData exists
    if (!args.inputFileObj || !args.inputFileObj.ffProbeData) {
        args.jobLog('ERROR: No ffprobe data available');
        return {
            outputFileObj: args.inputFileObj,
            outputNumber: 2,
            variables: args.variables,
        };
    }

    var streams = args.inputFileObj.ffProbeData.streams;

    // Validate streams is an array
    if (!Array.isArray(streams)) {
        args.jobLog('ERROR: ffprobe streams is not an array');
        return {
            outputFileObj: args.inputFileObj,
            outputNumber: 2,
            variables: args.variables,
        };
    }

    // Find main audio stream: prefer default disposition, fallback to first audio
    // We want the FIRST audio stream that has default disposition,
    // not just any stream with default disposition
    var mainAudio = null;
    var mainAudioGlobalIndex = -1;  // Index in streams array (0:X)
    var mainAudioRelativeIndex = -1; // Index among audio streams (0:a:X)
    var firstAudio = null;
    var firstAudioGlobalIndex = -1;
    var firstAudioRelativeIndex = -1;
    var audioCount = 0;

    for (var i = 0; i < streams.length; i++) {
        var stream = streams[i];
        if (stream.codec_type === 'audio') {
            // Track first audio stream as fallback
            if (firstAudio === null) {
                firstAudio = stream;
                firstAudioGlobalIndex = i;
                firstAudioRelativeIndex = audioCount;
            }

            // Check for default disposition (can be 1, true, or "1")
            var isDefault = stream.disposition &&
                (stream.disposition.default === 1 ||
                 stream.disposition.default === true ||
                 stream.disposition.default === '1');

            // Take the first stream with default disposition
            if (isDefault && mainAudio === null) {
                mainAudio = stream;
                mainAudioGlobalIndex = i;
                mainAudioRelativeIndex = audioCount;
                // Don't break - continue to count total audio streams
            }

            audioCount++;
        }
    }

    // Use default audio if found, otherwise first audio
    var targetAudio = mainAudio || firstAudio;
    var targetGlobalIndex = mainAudio ? mainAudioGlobalIndex : firstAudioGlobalIndex;
    var targetRelativeIndex = mainAudio ? mainAudioRelativeIndex : firstAudioRelativeIndex;
    var selectionMethod = mainAudio ? 'default disposition' : 'first audio stream';

    if (!targetAudio) {
        args.jobLog('No audio streams found in file (total streams: ' + streams.length + ')');
        return {
            outputFileObj: args.inputFileObj,
            outputNumber: 2,
            variables: args.variables,
        };
    }

    // Get channel count with validation
    var channels = targetAudio.channels;

    if (typeof channels !== 'number' || !isFinite(channels) || channels < 0) {
        args.jobLog('ERROR: Invalid channel count in audio stream: ' + JSON.stringify(channels));
        args.jobLog('Stream info: codec=' + (targetAudio.codec_name || 'unknown') +
            ', global index=0:' + targetGlobalIndex + ', audio index=0:a:' + targetRelativeIndex);
        return {
            outputFileObj: args.inputFileObj,
            outputNumber: 2,
            variables: args.variables,
        };
    }

    // Log detailed info
    var codecName = targetAudio.codec_name || 'unknown';
    var channelLayout = targetAudio.channel_layout || 'unspecified';
    var language = (targetAudio.tags && targetAudio.tags.language) || 'und';
    var title = (targetAudio.tags && targetAudio.tags.title) || '';

    args.jobLog('Audio streams found: ' + audioCount);
    args.jobLog('Main audio selected via: ' + selectionMethod);
    args.jobLog('Stream 0:' + targetGlobalIndex + ' (0:a:' + targetRelativeIndex + '): ' + codecName +
        ' ' + channels + 'ch (' + channelLayout + ')' +
        ' [' + language + ']' +
        (title ? ' "' + title + '"' : ''));

    // Evaluate condition
    var matches = false;
    switch (condition) {
        case 'stereo':
            matches = channels === 2;
            args.jobLog('Checking: is stereo (2ch)? ' + (matches ? 'YES' : 'NO - has ' + channels + 'ch'));
            break;
        case 'multichannel':
            matches = channels > 2;
            args.jobLog('Checking: is multichannel (>2ch)? ' + (matches ? 'YES (' + channels + 'ch)' : 'NO - has ' + channels + 'ch'));
            break;
        case 'mono':
            matches = channels === 1;
            args.jobLog('Checking: is mono (1ch)? ' + (matches ? 'YES' : 'NO - has ' + channels + 'ch'));
            break;
        default:
            // Should never reach here due to earlier validation, but safety first
            args.jobLog('ERROR: Unhandled condition: ' + condition);
            return {
                outputFileObj: args.inputFileObj,
                outputNumber: 2,
                variables: args.variables,
            };
    }

    args.jobLog('Result: ' + (matches ? 'MATCH (output 1)' : 'NO MATCH (output 2)'));

    return {
        outputFileObj: args.inputFileObj,
        outputNumber: matches ? 1 : 2,
        variables: args.variables,
    };
};
exports.plugin = plugin;
