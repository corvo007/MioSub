# Subtitle Format Parsing

## SRT Format

### Structure

```
1
00:00:01,000 --> 00:00:04,000
First subtitle line

2
00:00:05,000 --> 00:00:08,000
Second subtitle line
with multiple lines
```

### Parser Implementation

```typescript
const SRT_TIMESTAMP_REGEX = /(\d{2}):(\d{2}):(\d{2}),(\d{3})/;

export function parseSrtTimestamp(timestamp: string): number {
  const match = timestamp.match(SRT_TIMESTAMP_REGEX);
  if (!match) throw new Error(`Invalid SRT timestamp: ${timestamp}`);

  const [, hours, minutes, seconds, ms] = match;
  return (
    parseInt(hours) * 3600000 + parseInt(minutes) * 60000 + parseInt(seconds) * 1000 + parseInt(ms)
  );
}

export function formatSrtTimestamp(ms: number): string {
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  const millis = ms % 1000;

  return (
    [
      hours.toString().padStart(2, '0'),
      minutes.toString().padStart(2, '0'),
      seconds.toString().padStart(2, '0'),
    ].join(':') +
    ',' +
    millis.toString().padStart(3, '0')
  );
}
```

## ASS Format

### Structure

```
[Script Info]
Title: Subtitle
ScriptType: v4.00+

[V4+ Styles]
Format: Name, Fontname, Fontsize, ...
Style: Default,Arial,20,...

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:01.00,0:00:04.00,Default,,0,0,0,,First subtitle
```

### Parser Implementation

```typescript
const ASS_TIMESTAMP_REGEX = /(\d+):(\d{2}):(\d{2})\.(\d{2})/;

export function parseAssTimestamp(timestamp: string): number {
  const match = timestamp.match(ASS_TIMESTAMP_REGEX);
  if (!match) throw new Error(`Invalid ASS timestamp: ${timestamp}`);

  const [, hours, minutes, seconds, centiseconds] = match;
  return (
    parseInt(hours) * 3600000 +
    parseInt(minutes) * 60000 +
    parseInt(seconds) * 1000 +
    parseInt(centiseconds) * 10
  );
}

export function parseAssDialogue(line: string): SubtitleEntry | null {
  if (!line.startsWith('Dialogue:')) return null;

  const parts = line.substring(10).split(',');
  const start = parseAssTimestamp(parts[1]);
  const end = parseAssTimestamp(parts[2]);
  const text = parts.slice(9).join(',').replace(/\\N/g, '\n');

  return { startTime: start, endTime: end, text, index: 0 };
}
```

## VTT Format

### Structure

```
WEBVTT

00:00:01.000 --> 00:00:04.000
First subtitle line

00:00:05.000 --> 00:00:08.000
Second subtitle line
```

### Parser Implementation

```typescript
const VTT_TIMESTAMP_REGEX = /(\d{2}):(\d{2}):(\d{2})\.(\d{3})/;

export function parseVttTimestamp(timestamp: string): number {
  const match = timestamp.match(VTT_TIMESTAMP_REGEX);
  if (!match) throw new Error(`Invalid VTT timestamp: ${timestamp}`);

  const [, hours, minutes, seconds, ms] = match;
  return (
    parseInt(hours) * 3600000 + parseInt(minutes) * 60000 + parseInt(seconds) * 1000 + parseInt(ms)
  );
}
```

## Format Conversion

```typescript
export function convertToSrt(entries: SubtitleEntry[]): string {
  return entries
    .map((entry, i) => {
      return [
        i + 1,
        `${formatSrtTimestamp(entry.startTime)} --> ${formatSrtTimestamp(entry.endTime)}`,
        entry.text,
      ].join('\n');
    })
    .join('\n\n');
}
```
