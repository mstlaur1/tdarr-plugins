"use strict";
/**
 * Normalize Audio Titles
 *
 * Normalizes all audio track titles to a consistent format:
 * {Language} {Descriptor} - {Codec} - {Channels}
 *
 * Examples:
 * - English Original - DTS-HD MA - 7.1
 * - English - DD+ - 5.1
 * - English - AAC - Stereo
 * - French Commentary - DD - 5.1
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.plugin = exports.details = void 0;

var details = function () { return ({
    name: 'Normalize Audio Titles',
    description: 'Normalizes all audio track titles to format: {Language} {Descriptor} - {Codec} - {Channels}. First track per language marked as Original. Fixes missing language tags.',
    style: {
        borderColor: '#9b59b6',
    },
    tags: 'audio',
    isStartPlugin: false,
    pType: '',
    requiresVersion: '2.11.01',
    sidebarPosition: -1,
    icon: '',
    inputs: [
        {
            label: 'Default Language Code',
            name: 'defaultLanguage',
            type: 'string',
            defaultValue: 'eng',
            inputUI: {
                type: 'dropdown',
                options: ['eng', 'fre', 'spa', 'ger', 'ita', 'jpn', 'por', 'rus', 'chi', 'kor'],
            },
            tooltip: 'Fallback language if no track has a language tag',
        },
    ],
    outputs: [
        {
            number: 1,
            tooltip: 'Titles normalized successfully',
        },
        {
            number: 2,
            tooltip: 'Error or no audio streams',
        },
    ],
}); };
exports.details = details;

// Language code to display name mapping
var LANGUAGE_MAP = {
    'eng': 'English',
    'en': 'English',
    'fre': 'French',
    'fra': 'French',
    'fr': 'French',
    'spa': 'Spanish',
    'es': 'Spanish',
    'ger': 'German',
    'deu': 'German',
    'de': 'German',
    'ita': 'Italian',
    'it': 'Italian',
    'jpn': 'Japanese',
    'ja': 'Japanese',
    'por': 'Portuguese',
    'pt': 'Portuguese',
    'rus': 'Russian',
    'ru': 'Russian',
    'chi': 'Chinese',
    'zho': 'Chinese',
    'zh': 'Chinese',
    'kor': 'Korean',
    'ko': 'Korean',
    'ara': 'Arabic',
    'ar': 'Arabic',
    'hin': 'Hindi',
    'hi': 'Hindi',
    'pol': 'Polish',
    'pl': 'Polish',
    'dut': 'Dutch',
    'nld': 'Dutch',
    'nl': 'Dutch',
    'swe': 'Swedish',
    'sv': 'Swedish',
    'nor': 'Norwegian',
    'no': 'Norwegian',
    'dan': 'Danish',
    'da': 'Danish',
    'fin': 'Finnish',
    'fi': 'Finnish',
    'tha': 'Thai',
    'th': 'Thai',
    'vie': 'Vietnamese',
    'vi': 'Vietnamese',
    'tur': 'Turkish',
    'tr': 'Turkish',
    'heb': 'Hebrew',
    'he': 'Hebrew',
    'ind': 'Indonesian',
    'id': 'Indonesian',
    'may': 'Malay',
    'msa': 'Malay',
    'ms': 'Malay',
    'hun': 'Hungarian',
    'hu': 'Hungarian',
    'cze': 'Czech',
    'ces': 'Czech',
    'cs': 'Czech',
    'gre': 'Greek',
    'ell': 'Greek',
    'el': 'Greek',
    'ron': 'Romanian',
    'rum': 'Romanian',
    'ro': 'Romanian',
    'ukr': 'Ukrainian',
    'uk': 'Ukrainian'
};

// Get display name for language code
function getLanguageName(code, defaultLang) {
    if (!code || code === 'und' || code === 'unk') {
        return LANGUAGE_MAP[defaultLang] || 'Unknown';
    }
    var lower = code.toLowerCase();
    return LANGUAGE_MAP[lower] || code.charAt(0).toUpperCase() + code.slice(1).toLowerCase();
}

// Get codec display name
function getCodecDisplayName(codecName, profile) {
    var codec = (codecName || '').toLowerCase();
    var prof = (profile || '').toLowerCase();

    // EAC3 / E-AC-3 -> DD+
    if (codec === 'eac3') {
        // Check for Atmos (JOC profile)
        if (prof.indexOf('joc') !== -1 || prof.indexOf('atmos') !== -1) {
            return 'DD+ Atmos';
        }
        return 'DD+';
    }

    // AC3 -> DD
    if (codec === 'ac3') {
        return 'DD';
    }

    // DTS variants
    if (codec === 'dts' || codec === 'dca') {
        if (prof.indexOf('ma') !== -1 || prof.indexOf('master') !== -1) {
            return 'DTS-HD MA';
        }
        if (prof.indexOf('hra') !== -1 || prof.indexOf('high res') !== -1) {
            return 'DTS-HD HRA';
        }
        if (prof.indexOf('x') !== -1 && prof.indexOf('express') === -1) {
            return 'DTS:X';
        }
        if (prof.indexOf('es') !== -1) {
            return 'DTS-ES';
        }
        return 'DTS';
    }

    // TrueHD
    if (codec === 'truehd') {
        if (prof.indexOf('atmos') !== -1) {
            return 'TrueHD Atmos';
        }
        return 'TrueHD';
    }

    // AAC
    if (codec === 'aac') {
        return 'AAC';
    }

    // FLAC
    if (codec === 'flac') {
        return 'FLAC';
    }

    // Opus
    if (codec === 'opus') {
        return 'Opus';
    }

    // MP3
    if (codec === 'mp3') {
        return 'MP3';
    }

    // PCM variants
    if (codec.indexOf('pcm') !== -1) {
        return 'PCM';
    }

    // Vorbis
    if (codec === 'vorbis') {
        return 'Vorbis';
    }

    // WMA
    if (codec.indexOf('wma') !== -1) {
        return 'WMA';
    }

    // Fallback - capitalize first letter
    return codec.toUpperCase();
}

// Get channel format display
function getChannelDisplay(channels, profile, channelLayout) {
    var prof = (profile || '').toLowerCase();
    var layout = (channelLayout || '').toLowerCase();

    // Check for Atmos in profile (already handled in codec, but also affects channel display)
    if (prof.indexOf('joc') !== -1 || prof.indexOf('atmos') !== -1) {
        return 'Atmos';
    }

    // Check layout for Atmos indicators
    if (layout.indexOf('atmos') !== -1) {
        return 'Atmos';
    }

    // Standard channel counts
    if (channels === 8) return '7.1';
    if (channels === 7) return '6.1';
    if (channels === 6) return '5.1';
    if (channels === 5) return '5.0';
    if (channels === 4) return '4.0';
    if (channels === 3) return '3.0';
    if (channels === 2) return 'Stereo';
    if (channels === 1) return 'Mono';

    // For unusual channel counts (like Atmos with many channels)
    if (channels > 8) return channels + 'ch';

    return channels + 'ch';
}

// Detect descriptor from existing title
function detectDescriptor(existingTitle) {
    if (!existingTitle) return '';
    var lower = existingTitle.toLowerCase();

    if (lower.indexOf('commentary') !== -1) {
        return 'Commentary';
    }
    if (lower.indexOf('descriptive') !== -1 || lower.indexOf('described') !== -1 ||
        lower.indexOf('audio description') !== -1 || lower === 'ad') {
        return 'Descriptive';
    }
    if (lower.indexOf('director') !== -1) {
        return 'Directors Commentary';
    }

    return '';
}

// Check if language code is valid (not undefined/unknown)
function isValidLanguage(code) {
    if (!code) return false;
    var lower = code.toLowerCase();
    return lower !== 'und' && lower !== 'unk' && lower !== '';
}

var plugin = function (args) {
    var fs = require('fs');
    var path = require('path');
    var crypto = require('crypto');
    var spawn = require('child_process').spawnSync;

    var lib = require('../../../../../methods/lib')();

    // Load default values
    try {
        args.inputs = lib.loadDefaultValues(args.inputs, details);
    } catch (e) {
        args.jobLog('ERROR: Failed to load default values: ' + e.message);
        return { outputFileObj: args.inputFileObj, outputNumber: 2, variables: args.variables };
    }

    var defaultLanguage = args.inputs.defaultLanguage || 'eng';

    var inputFile = args.inputFileObj._id || args.inputFileObj.file;
    if (!inputFile) {
        args.jobLog('ERROR: Could not determine input file path');
        return { outputFileObj: args.inputFileObj, outputNumber: 2, variables: args.variables };
    }

    // Validate ffProbeData exists
    if (!args.inputFileObj.ffProbeData || !args.inputFileObj.ffProbeData.streams) {
        args.jobLog('ERROR: No ffprobe data available');
        return { outputFileObj: args.inputFileObj, outputNumber: 2, variables: args.variables };
    }

    var streams = args.inputFileObj.ffProbeData.streams;
    if (!Array.isArray(streams)) {
        args.jobLog('ERROR: ffprobe streams is not an array');
        return { outputFileObj: args.inputFileObj, outputNumber: 2, variables: args.variables };
    }

    // First pass: find first audio track with valid language
    var inheritedLanguage = defaultLanguage;
    for (var i = 0; i < streams.length; i++) {
        var stream = streams[i];
        if (stream.codec_type === 'audio') {
            var lang = stream.tags && stream.tags.language;
            if (isValidLanguage(lang)) {
                inheritedLanguage = lang;
                args.jobLog('Inherited language from first track: ' + lang);
                break;
            }
        }
    }

    // Second pass: build metadata for each audio stream
    var audioMetadata = [];
    var seenLanguages = {}; // Track first occurrence per language for "Original" marker
    var audioIndex = 0;

    for (var j = 0; j < streams.length; j++) {
        var audioStream = streams[j];
        if (audioStream.codec_type !== 'audio') continue;

        // Get language (use stream tag or inherit)
        var streamLang = audioStream.tags && audioStream.tags.language;
        var effectiveLang = isValidLanguage(streamLang) ? streamLang : inheritedLanguage;
        var langCode = effectiveLang.toLowerCase();

        // Normalize language code for grouping (handle variants)
        var langKey = langCode;
        if (langCode === 'fra') langKey = 'fre';
        if (langCode === 'deu') langKey = 'ger';
        if (langCode === 'zho') langKey = 'chi';
        if (langCode === 'ces') langKey = 'cze';
        if (langCode === 'nld') langKey = 'dut';
        if (langCode === 'ell') langKey = 'gre';
        if (langCode === 'msa') langKey = 'may';
        if (langCode === 'ron') langKey = 'rum';

        // Determine if this is the "Original" track (first of this language)
        var isOriginal = !seenLanguages[langKey];
        seenLanguages[langKey] = true;

        // Get existing title for descriptor detection
        var existingTitle = audioStream.tags && audioStream.tags.title;
        var descriptor = detectDescriptor(existingTitle);

        // If has descriptor like Commentary, don't mark as Original
        if (descriptor) {
            isOriginal = false;
        }

        // Build components
        var languageName = getLanguageName(effectiveLang, defaultLanguage);
        var codecName = getCodecDisplayName(audioStream.codec_name, audioStream.profile);
        var channelDisplay = getChannelDisplay(audioStream.channels, audioStream.profile, audioStream.channel_layout);

        // Handle Atmos - don't duplicate "Atmos" in title
        // If codec is "DD+ Atmos" or "TrueHD Atmos", channel display shouldn't also say "Atmos"
        if ((codecName.indexOf('Atmos') !== -1) && channelDisplay === 'Atmos') {
            // Use the channel count instead
            if (audioStream.channels === 8) channelDisplay = '7.1';
            else if (audioStream.channels === 6) channelDisplay = '5.1';
            else channelDisplay = audioStream.channels + 'ch';
        }

        // Build title
        var titleParts = [languageName];
        if (isOriginal) titleParts.push('Original');
        if (descriptor) titleParts.push(descriptor);

        var title = titleParts.join(' ') + ' - ' + codecName + ' - ' + channelDisplay;

        audioMetadata.push({
            index: audioIndex,
            title: title,
            language: effectiveLang,
            originalTitle: existingTitle || ''
        });

        args.jobLog('Audio ' + audioIndex + ': "' + title + '" (was: "' + (existingTitle || 'none') + '")');
        audioIndex++;
    }

    if (audioMetadata.length === 0) {
        args.jobLog('No audio streams found');
        return { outputFileObj: args.inputFileObj, outputNumber: 2, variables: args.variables };
    }

    // Check if any titles actually need changing
    var needsUpdate = false;
    for (var checkIdx = 0; checkIdx < audioMetadata.length; checkIdx++) {
        var checkMeta = audioMetadata[checkIdx];
        if (checkMeta.title !== checkMeta.originalTitle) {
            needsUpdate = true;
            break;
        }
    }

    if (!needsUpdate) {
        args.jobLog('All audio titles are already correct, skipping remux');
        return { outputFileObj: args.inputFileObj, outputNumber: 1, variables: args.variables };
    }

    args.jobLog('Title changes needed, proceeding with remux');

    // Use TDarr's work directory
    var workDir = args.workDir || '/temp';

    // Generate unique temp file name
    var uniqueId;
    if (typeof crypto.randomUUID === 'function') {
        uniqueId = crypto.randomUUID();
    } else {
        uniqueId = crypto.randomBytes(16).toString('hex');
    }

    var ext = path.extname(inputFile);
    var tempFile = path.join(workDir, 'normalize_' + uniqueId + ext);

    // Get ffmpeg path
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
        '-map', '0',
        '-c', 'copy'
    ];

    // Add metadata for each audio stream
    for (var k = 0; k < audioMetadata.length; k++) {
        var meta = audioMetadata[k];
        spawnArgs.push('-metadata:s:a:' + meta.index, 'title=' + meta.title);
        spawnArgs.push('-metadata:s:a:' + meta.index, 'language=' + meta.language);
    }

    spawnArgs.push(tempFile);

    args.jobLog('Executing ffmpeg to update metadata...');
    args.jobLog('Input: ' + path.basename(inputFile));

    var result = spawn(ffmpegCli, spawnArgs, {
        encoding: 'utf8',
        maxBuffer: 50 * 1024 * 1024,
        timeout: 10 * 60 * 1000 // 10 minute timeout for remux
    });

    if (result.status !== 0) {
        var errorOutput = (result.stderr || '').slice(-3000);
        args.jobLog('FFmpeg error (exit code ' + result.status + '):');
        args.jobLog(errorOutput);
        // Cleanup temp file
        try { fs.unlinkSync(tempFile); } catch (e) { /* ignore */ }
        return { outputFileObj: args.inputFileObj, outputNumber: 2, variables: args.variables };
    }

    // Verify output exists
    var outputStats;
    try {
        outputStats = fs.statSync(tempFile);
    } catch (e) {
        args.jobLog('ERROR: Output file not created');
        return { outputFileObj: args.inputFileObj, outputNumber: 2, variables: args.variables };
    }

    // Check output is reasonable size (at least 90% of input)
    var inputStats;
    try {
        inputStats = fs.statSync(inputFile);
    } catch (e) {
        args.jobLog('ERROR: Could not stat input file');
        try { fs.unlinkSync(tempFile); } catch (e2) { /* ignore */ }
        return { outputFileObj: args.inputFileObj, outputNumber: 2, variables: args.variables };
    }

    if (outputStats.size < inputStats.size * 0.9) {
        args.jobLog('ERROR: Output too small (' + Math.round(outputStats.size / 1024 / 1024) +
            'MB vs input ' + Math.round(inputStats.size / 1024 / 1024) + 'MB)');
        try { fs.unlinkSync(tempFile); } catch (e) { /* ignore */ }
        return { outputFileObj: args.inputFileObj, outputNumber: 2, variables: args.variables };
    }

    // Replace original with temp
    var backupFile = inputFile + '.backup_' + uniqueId;
    try {
        // Backup original
        fs.renameSync(inputFile, backupFile);

        try {
            // Move temp to original location
            try {
                fs.renameSync(tempFile, inputFile);
            } catch (renameErr) {
                // Cross-filesystem, copy then delete
                fs.copyFileSync(tempFile, inputFile);
                fs.unlinkSync(tempFile);
            }
            // Success - remove backup
            fs.unlinkSync(backupFile);
        } catch (moveErr) {
            // Restore backup
            args.jobLog('ERROR moving file: ' + moveErr.message);
            try {
                fs.renameSync(backupFile, inputFile);
            } catch (restoreErr) {
                args.jobLog('CRITICAL: Could not restore backup: ' + restoreErr.message);
            }
            try { fs.unlinkSync(tempFile); } catch (e) { /* ignore */ }
            return { outputFileObj: args.inputFileObj, outputNumber: 2, variables: args.variables };
        }
    } catch (backupErr) {
        args.jobLog('ERROR creating backup: ' + backupErr.message);
        try { fs.unlinkSync(tempFile); } catch (e) { /* ignore */ }
        return { outputFileObj: args.inputFileObj, outputNumber: 2, variables: args.variables };
    }

    args.jobLog('SUCCESS: Audio titles normalized');

    return {
        outputFileObj: Object.assign({}, args.inputFileObj, { _id: inputFile }),
        outputNumber: 1,
        variables: args.variables,
    };
};
exports.plugin = plugin;
