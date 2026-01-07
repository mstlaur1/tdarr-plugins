"use strict";
/**
 * Process Audio Complete
 *
 * Combines all audio processing into a single ffmpeg pass:
 * - DTS→DD+ conversion (if DTS present)
 * - Stereo downmix creation (if multichannel and no stereo exists)
 * - Stream reordering by language/codec
 * - Title normalization
 *
 * This dramatically reduces disk I/O by doing everything in one pass.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.plugin = exports.details = void 0;
var cliUtils_1 = require("../../../../FlowHelpers/1.0.0/cliUtils");
var fileUtils_1 = require("../../../../FlowHelpers/1.0.0/fileUtils");

var details = function () { return ({
    name: 'Process Audio Complete',
    description: 'All-in-one audio processing: DTS→DD+, stereo downmix, reorder, and title normalization in a single ffmpeg pass.',
    style: {
        borderColor: '#e74c3c',
    },
    tags: 'audio',
    isStartPlugin: false,
    pType: '',
    requiresVersion: '2.11.01',
    sidebarPosition: -1,
    icon: '',
    inputs: [
        {
            label: 'Create DD+ from DTS',
            name: 'createDDP',
            type: 'boolean',
            defaultValue: true,
            inputUI: { type: 'switch' },
            tooltip: 'Convert DTS to DD+ (EAC3) at 640kbps',
        },
        {
            label: 'Create Stereo Downmix',
            name: 'createStereo',
            type: 'boolean',
            defaultValue: true,
            inputUI: { type: 'switch' },
            tooltip: 'Create AAC stereo downmix from multichannel audio',
        },
        {
            label: 'Stereo Bitrate (kbps)',
            name: 'stereoBitrate',
            type: 'string',
            defaultValue: '256',
            inputUI: {
                type: 'dropdown',
                options: ['128', '192', '256', '320'],
            },
            tooltip: 'AAC bitrate for stereo track',
        },
        {
            label: 'Normalize Audio (Stereo)',
            name: 'normalize',
            type: 'boolean',
            defaultValue: true,
            inputUI: { type: 'switch' },
            tooltip: 'Apply loudnorm to stereo track',
        },
        {
            label: 'Loudnorm Target (LUFS)',
            name: 'loudnormTarget',
            type: 'string',
            defaultValue: '-16',
            inputUI: {
                type: 'dropdown',
                options: ['-14', '-16', '-18', '-20', '-23'],
            },
            tooltip: 'Target loudness for stereo track',
        },
        {
            label: 'Language Priority',
            name: 'languages',
            type: 'string',
            defaultValue: 'eng,fre',
            inputUI: { type: 'text' },
            tooltip: 'Comma-separated language codes in priority order',
        },
        {
            label: 'Codec Priority',
            name: 'codecs',
            type: 'string',
            defaultValue: 'eac3,dts,aac',
            inputUI: { type: 'text' },
            tooltip: 'Comma-separated codec names in priority order',
        },
        {
            label: 'Default Language',
            name: 'defaultLanguage',
            type: 'string',
            defaultValue: 'eng',
            inputUI: { type: 'text' },
            tooltip: 'Default language code for tracks without language tag',
        },
    ],
    outputs: [
        { number: 1, tooltip: 'Processing completed successfully' },
        { number: 2, tooltip: 'No processing needed or error' },
    ],
}); };
exports.details = details;

// Language code to display name
var LANGUAGE_MAP = {
    'eng': 'English', 'en': 'English',
    'fre': 'French', 'fra': 'French', 'fr': 'French',
    'spa': 'Spanish', 'es': 'Spanish',
    'ger': 'German', 'deu': 'German', 'de': 'German',
    'ita': 'Italian', 'it': 'Italian',
    'jpn': 'Japanese', 'ja': 'Japanese',
    'por': 'Portuguese', 'pt': 'Portuguese',
    'rus': 'Russian', 'ru': 'Russian',
    'chi': 'Chinese', 'zho': 'Chinese', 'zh': 'Chinese',
    'kor': 'Korean', 'ko': 'Korean',
    'dut': 'Dutch', 'nld': 'Dutch', 'nl': 'Dutch',
};

function getLanguageName(code, defaultLang) {
    if (!code || code === 'und' || code === 'unk') {
        return LANGUAGE_MAP[defaultLang] || 'Unknown';
    }
    return LANGUAGE_MAP[code.toLowerCase()] || code;
}

function getCodecDisplayName(codecName, profile) {
    var codec = (codecName || '').toLowerCase();
    var prof = (profile || '').toLowerCase();

    if (codec === 'eac3') {
        if (prof.indexOf('joc') !== -1) return 'DD+ Atmos';
        return 'DD+';
    }
    if (codec === 'ac3') return 'DD';
    if (codec === 'dts' || codec === 'dca') {
        if (prof.indexOf('ma') !== -1 || prof.indexOf('master') !== -1) return 'DTS-HD MA';
        if (prof.indexOf('hra') !== -1) return 'DTS-HD HRA';
        if (prof.indexOf('x') !== -1 && prof.indexOf('express') === -1) return 'DTS:X';
        return 'DTS';
    }
    if (codec === 'truehd') {
        if (prof.indexOf('atmos') !== -1) return 'TrueHD Atmos';
        return 'TrueHD';
    }
    if (codec === 'aac') return 'AAC';
    if (codec === 'flac') return 'FLAC';
    if (codec === 'opus') return 'Opus';
    if (codec.indexOf('pcm') !== -1) return 'PCM';
    return codec.toUpperCase();
}

function getChannelDisplay(channels, profile) {
    var prof = (profile || '').toLowerCase();
    if (prof.indexOf('joc') !== -1 || prof.indexOf('atmos') !== -1) return 'Atmos';
    if (channels === 8) return '7.1';
    if (channels === 7) return '6.1';
    if (channels === 6) return '5.1';
    if (channels === 2) return 'Stereo';
    if (channels === 1) return 'Mono';
    return channels + 'ch';
}

// Get pan filter for stereo downmix
function getPanFilter(channels) {
    if (channels === 8) {
        return 'pan=stereo|FL=0.70*FL+0.70*FC+0.25*SL+0.20*BL+0.20*LFE|FR=0.70*FR+0.70*FC+0.25*SR+0.20*BR+0.20*LFE';
    }
    if (channels >= 6) {
        return 'pan=stereo|FL=0.70*FL+0.70*FC+0.30*SL+0.30*BL+0.25*LFE|FR=0.70*FR+0.70*FC+0.30*SR+0.30*BR+0.25*LFE';
    }
    if (channels > 2) {
        return 'pan=stereo|FL=0.70*FL+0.70*FC|FR=0.70*FR+0.70*FC';
    }
    return 'aformat=channel_layouts=stereo';
}

// Normalize language code for comparison (handles both 2-letter ISO 639-1 and 3-letter codes)
function normalizeLangCode(code) {
    if (!code) return 'und';
    var c = code.toLowerCase();

    // 2-letter ISO 639-1 → 3-letter bibliographic
    var map2 = {
        en: 'eng', fr: 'fre', es: 'spa', de: 'ger', it: 'ita',
        pt: 'por', nl: 'dut', sv: 'swe', no: 'nor', da: 'dan',
        fi: 'fin', pl: 'pol', cs: 'cze', ja: 'jpn', ko: 'kor',
        zh: 'chi', ar: 'ara', ru: 'rus', uk: 'ukr'
    };
    if (c.length === 2 && map2[c]) return map2[c];

    // 3-letter terminology → bibliographic (where they differ)
    var map3 = { fra: 'fre', deu: 'ger', nld: 'dut', zho: 'chi', ces: 'cze', ron: 'rum' };
    if (map3[c]) return map3[c];

    return c;
}

// Parse audio index from source string like "0:a:2"
function parseAudioIndexFromSource(source) {
    var m = /0:a:(\d+)/.exec(source || '');
    return m ? parseInt(m[1], 10) : -1;
}

var plugin = async function (args) {
    var fs = require('fs');
    var lib = require('../../../../../methods/lib')();

    try {
        args.inputs = lib.loadDefaultValues(args.inputs, details);
    } catch (e) {
        args.jobLog('ERROR: Failed to load default values: ' + e.message);
        return { outputFileObj: args.inputFileObj, outputNumber: 2, variables: args.variables };
    }

    var createDDP = args.inputs.createDDP === true || args.inputs.createDDP === 'true';
    var createStereo = args.inputs.createStereo === true || args.inputs.createStereo === 'true';
    var stereoBitrate = parseInt(args.inputs.stereoBitrate, 10) || 256;
    var normalize = args.inputs.normalize === true || args.inputs.normalize === 'true';
    var loudnormTarget = parseInt(args.inputs.loudnormTarget, 10) || -16;
    var languagePriority = (args.inputs.languages || 'eng').split(',').map(function(s) { return s.trim().toLowerCase(); });
    var codecPriority = (args.inputs.codecs || 'eac3,dts,aac').split(',').map(function(s) { return s.trim().toLowerCase(); });
    var defaultLanguage = args.inputs.defaultLanguage || 'eng';

    var inputFile = args.inputFileObj._id || args.inputFileObj.file;
    if (!inputFile) {
        args.jobLog('ERROR: Could not determine input file path');
        return { outputFileObj: args.inputFileObj, outputNumber: 2, variables: args.variables };
    }

    if (!args.inputFileObj.ffProbeData || !args.inputFileObj.ffProbeData.streams) {
        args.jobLog('ERROR: No ffprobe data available');
        return { outputFileObj: args.inputFileObj, outputNumber: 2, variables: args.variables };
    }

    var streams = args.inputFileObj.ffProbeData.streams;

    // Analyze audio streams
    var audioStreams = [];
    var hasMultichannel = false;
    var hasEnglishStereo = false;
    var mainAudioIndex = 0;      // index into audioStreams array
    var mainAudioChannels = 0;
    var mainAudioLang = defaultLanguage;
    var mainAudioCodec = '';

    for (var i = 0; i < streams.length; i++) {
        var s = streams[i];
        if (s.codec_type === 'audio') {
            var lang = (s.tags && s.tags.language) || '';
            var normLang = normalizeLangCode(lang);
            var codecLower = (s.codec_name || '').toLowerCase();
            var currentAudioIdx = audioStreams.length;

            audioStreams.push({
                index: s.index,
                audioIndex: currentAudioIdx,
                codec: s.codec_name,
                codecLower: codecLower,
                channels: s.channels,
                language: lang,
                normLang: normLang,
                profile: s.profile || '',
                title: (s.tags && s.tags.title) || '',
                isDefault: s.disposition && s.disposition.default === 1,
            });

            if (s.channels > 2) {
                hasMultichannel = true;
            }

            // Track main audio (first audio, or one with default disposition)
            if (currentAudioIdx === 0 || (s.disposition && s.disposition.default === 1)) {
                mainAudioIndex = currentAudioIdx;
                mainAudioChannels = s.channels || 2;
                mainAudioLang = normLang || defaultLanguage;
                mainAudioCodec = codecLower;
            }

            // Check for existing English stereo
            if (s.channels === 2 && (normLang === 'eng' || !lang || lang === 'und')) {
                hasEnglishStereo = true;
            }
        }
    }

    if (audioStreams.length === 0) {
        args.jobLog('No audio streams found');
        return { outputFileObj: args.inputFileObj, outputNumber: 2, variables: args.variables };
    }

    // Determine what needs to be done based on MAIN audio track (not any random track)
    var mainIsDTS = (mainAudioCodec === 'dts' || mainAudioCodec === 'dca');
    var needsDDP = createDDP && mainIsDTS;
    var needsStereo = createStereo && (mainAudioChannels > 2) && !hasEnglishStereo;

    args.jobLog('Analysis: ' + audioStreams.length + ' audio streams, main is index ' + mainAudioIndex);
    args.jobLog('  Main codec: ' + mainAudioCodec + ', channels: ' + mainAudioChannels);
    args.jobLog('  Main is DTS: ' + mainIsDTS + ' → Create DD+: ' + needsDDP);
    args.jobLog('  Has Stereo: ' + hasEnglishStereo + ' → Create Stereo: ' + needsStereo);

    // Build output audio track list
    // Structure: [{source, codec, bitrate, filter, title, language, isNew}]
    var outputAudio = [];

    // If creating DD+, add it first (from the main audio track)
    if (needsDDP) {
        outputAudio.push({
            source: '0:a:' + mainAudioIndex,
            filterLabel: null,
            codec: 'eac3',
            bitrate: 640,
            title: null, // Will be set later
            language: mainAudioLang,
            channels: mainAudioChannels,
            isNew: true,
            isDDP: true,
        });
    }

    // Add all original audio (will be copied)
    for (var j = 0; j < audioStreams.length; j++) {
        var as = audioStreams[j];
        outputAudio.push({
            source: '0:a:' + as.audioIndex,
            filterLabel: null,
            codec: 'copy',
            bitrate: null,
            title: null,
            language: as.language || mainAudioLang,
            channels: as.channels,
            profile: as.profile,
            originalCodec: as.codec,
            isNew: false,
            isDDP: false,
        });
    }

    // If creating stereo, add it last
    var stereoFilterLabel = null;
    if (needsStereo) {
        stereoFilterLabel = 'stereo_out';
        outputAudio.push({
            source: null,
            filterLabel: stereoFilterLabel,
            codec: 'aac',
            bitrate: stereoBitrate,
            title: null,
            language: mainAudioLang,
            channels: 2,
            isNew: true,
            isDDP: false,
            isStereo: true,
        });
    }

    // Sort by language priority, then codec priority
    // But keep new tracks (DD+, stereo) in their logical positions
    var originalTracks = outputAudio.filter(function(t) { return !t.isNew; });
    var newDDP = outputAudio.filter(function(t) { return t.isDDP; });
    var newStereo = outputAudio.filter(function(t) { return t.isStereo; });

    // Sort original tracks
    originalTracks.sort(function(a, b) {
        var aLangIdx = languagePriority.indexOf(normalizeLangCode(a.language));
        var bLangIdx = languagePriority.indexOf(normalizeLangCode(b.language));
        if (aLangIdx === -1) aLangIdx = 999;
        if (bLangIdx === -1) bLangIdx = 999;
        if (aLangIdx !== bLangIdx) return aLangIdx - bLangIdx;

        var aCodecIdx = codecPriority.indexOf(a.originalCodec ? a.originalCodec.toLowerCase() : '');
        var bCodecIdx = codecPriority.indexOf(b.originalCodec ? b.originalCodec.toLowerCase() : '');
        if (aCodecIdx === -1) aCodecIdx = 999;
        if (bCodecIdx === -1) bCodecIdx = 999;
        return aCodecIdx - bCodecIdx;
    });

    // Final order: DD+ (if created) → sorted originals → stereo (if created)
    outputAudio = newDDP.concat(originalTracks).concat(newStereo);

    // Generate titles and track "Original" status
    var seenLanguages = {};
    for (var k = 0; k < outputAudio.length; k++) {
        var track = outputAudio[k];
        var lang = normalizeLangCode(track.language) || defaultLanguage;
        var langName = getLanguageName(track.language, defaultLanguage);

        // Only original (non-new) tracks can be labeled "Original"
        // Only mark language as seen when we encounter a non-new track
        var isOriginal = !seenLanguages[lang] && !track.isNew;
        if (!track.isNew) {
            seenLanguages[lang] = true;
        }

        var codecDisplay;
        if (track.isDDP) {
            codecDisplay = 'DD+';
        } else if (track.isStereo) {
            codecDisplay = 'AAC';
        } else {
            codecDisplay = getCodecDisplayName(track.originalCodec, track.profile);
        }

        var channelDisplay = getChannelDisplay(track.channels, track.profile);

        // Don't duplicate "Atmos" if it's in both codec and channel display
        if (codecDisplay.indexOf('Atmos') !== -1 && channelDisplay === 'Atmos') {
            channelDisplay = track.channels === 8 ? '7.1' : '5.1';
        }

        var titleParts = [langName];
        if (isOriginal && !track.isNew) titleParts.push('Original');
        track.title = titleParts.join(' ') + ' - ' + codecDisplay + ' - ' + channelDisplay;

        args.jobLog('Output audio ' + k + ': ' + track.title + (track.isNew ? ' (new)' : ''));
    }

    // Check if any actual changes are needed
    if (!needsDDP && !needsStereo) {
        // Check if reordering or title changes are needed
        var needsReorder = false;
        var needsTitleFix = false;

        // Compare titles by looking up the correct source stream (after sorting)
        for (var m = 0; m < originalTracks.length; m++) {
            var ot = originalTracks[m];
            var srcIdx = parseAudioIndexFromSource(ot.source);
            var origStream = (srcIdx >= 0) ? audioStreams[srcIdx] : null;
            if (origStream && (origStream.title || '') !== (ot.title || '')) {
                needsTitleFix = true;
                break;
            }
        }

        // Check if tracks are already in desired order
        for (var n = 0; n < originalTracks.length; n++) {
            var expectedSource = '0:a:' + n;
            if (originalTracks[n].source !== expectedSource) {
                needsReorder = true;
                break;
            }
        }

        if (!needsReorder && !needsTitleFix) {
            args.jobLog('No processing needed - file already optimal');
            return { outputFileObj: args.inputFileObj, outputNumber: 2, variables: args.variables };
        }
        args.jobLog('Processing needed: reorder=' + needsReorder + ', titleFix=' + needsTitleFix);
    }

    // Build ffmpeg command
    var outputFilePath = (0, fileUtils_1.getPluginWorkDir)(args) + '/' + (0, fileUtils_1.getFileName)(inputFile) + '.mkv';

    var filterComplex = '';
    var mapArgs = [];
    var codecArgs = [];
    var metadataArgs = [];

    // Map video and other streams
    mapArgs.push('-map', '0:v?');

    // Build filter_complex for stereo if needed (from main audio track)
    if (needsStereo) {
        var panFilter = getPanFilter(mainAudioChannels);
        var stereoFilters = panFilter;
        if (normalize) {
            stereoFilters += ',loudnorm=I=' + loudnormTarget + ':TP=-1.5:LRA=11';
        }
        stereoFilters += ',alimiter=limit=0.95';

        filterComplex = '[0:a:' + mainAudioIndex + ']' + stereoFilters + '[' + stereoFilterLabel + ']';
    }

    // Map audio in the correct order
    for (var p = 0; p < outputAudio.length; p++) {
        var audioTrack = outputAudio[p];

        if (audioTrack.filterLabel) {
            mapArgs.push('-map', '[' + audioTrack.filterLabel + ']');
        } else {
            mapArgs.push('-map', audioTrack.source);
        }

        // Codec settings
        if (audioTrack.codec === 'copy') {
            codecArgs.push('-c:a:' + p, 'copy');
        } else if (audioTrack.codec === 'eac3') {
            codecArgs.push('-c:a:' + p, 'eac3', '-b:a:' + p, audioTrack.bitrate + 'k');
        } else if (audioTrack.codec === 'aac') {
            codecArgs.push('-c:a:' + p, 'aac', '-b:a:' + p, audioTrack.bitrate + 'k', '-ac:a:' + p, '2');
        }

        // Metadata
        metadataArgs.push('-metadata:s:a:' + p, 'title=' + audioTrack.title);
        metadataArgs.push('-metadata:s:a:' + p, 'language=' + (audioTrack.language || defaultLanguage));

        // Disposition - first track is default
        if (p === 0) {
            metadataArgs.push('-disposition:a:' + p, 'default');
        } else {
            metadataArgs.push('-disposition:a:' + p, '0');
        }
    }

    // Map subtitles and attachments
    mapArgs.push('-map', '0:s?', '-map', '0:t?');
    codecArgs.push('-c:v', 'copy', '-c:s', 'copy', '-c:t', 'copy');

    // Build full command
    var spawnArgs = ['-y', '-i', inputFile];
    if (filterComplex) {
        spawnArgs.push('-filter_complex', filterComplex);
    }
    spawnArgs = spawnArgs.concat(mapArgs).concat(codecArgs).concat(metadataArgs);
    spawnArgs.push(outputFilePath);

    args.jobLog('Executing ffmpeg with ' + spawnArgs.length + ' args');
    args.jobLog('Filter: ' + (filterComplex || 'none'));

    // Update worker with CLI info for progress display
    args.updateWorker({
        CLIType: args.ffmpegPath,
        preset: spawnArgs.join(' '),
    });

    // Run ffmpeg with progress reporting
    var cli = new cliUtils_1.CLI({
        cli: args.ffmpegPath,
        spawnArgs: spawnArgs,
        spawnOpts: {},
        jobLog: args.jobLog,
        outputFilePath: outputFilePath,
        inputFileObj: args.inputFileObj,
        logFullCliOutput: args.logFullCliOutput,
        updateWorker: args.updateWorker,
        args: args,
    });

    var cliResult = await cli.runCli();

    if (cliResult.cliExitCode !== 0) {
        args.jobLog('FFmpeg failed with exit code: ' + cliResult.cliExitCode);
        try { fs.unlinkSync(outputFilePath); } catch (e) { }
        return { outputFileObj: args.inputFileObj, outputNumber: 2, variables: args.variables };
    }

    args.jobLog('FFmpeg completed successfully');

    // Verify output
    var inputStats, outputStats;
    try {
        inputStats = fs.statSync(inputFile);
        outputStats = fs.statSync(outputFilePath);
    } catch (e) {
        args.jobLog('ERROR: Could not stat files: ' + e.message);
        try { fs.unlinkSync(outputFilePath); } catch (e2) { }
        return { outputFileObj: args.inputFileObj, outputNumber: 2, variables: args.variables };
    }

    if (outputStats.size < inputStats.size * 0.5) {
        args.jobLog('ERROR: Output too small (' + Math.round(outputStats.size/1024/1024) + 'MB vs ' + Math.round(inputStats.size/1024/1024) + 'MB)');
        try { fs.unlinkSync(outputFilePath); } catch (e) { }
        return { outputFileObj: args.inputFileObj, outputNumber: 2, variables: args.variables };
    }

    args.jobLog('SUCCESS: File processed (' + Math.round(outputStats.size/1024/1024) + 'MB)');

    // Return the new file - let replaceOriginalFile plugin handle the replacement
    return {
        outputFileObj: { _id: outputFilePath },
        outputNumber: 1,
        variables: args.variables,
    };
};
exports.plugin = plugin;
