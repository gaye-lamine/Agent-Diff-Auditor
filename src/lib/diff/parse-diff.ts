import type { DiffHunk, ParsedDiffFile } from "./types";

const HUNK_HEADER = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;

/** Parses the file paths and hunks in a standard unified Git diff. */
export function parseDiff(diffText: string): ParsedDiffFile[] {
  const files: ParsedDiffFile[] = [];
  let currentFile: ParsedDiffFile | undefined;
  let currentHunk: DiffHunk | undefined;

  const finishHunk = () => {
    if (currentFile && currentHunk) currentFile.hunks.push(currentHunk);
    currentHunk = undefined;
  };

  for (const line of diffText.split(/\r?\n/)) {
    if (line.startsWith("diff --git ")) {
      finishHunk();
      if (currentFile) files.push(currentFile);
      currentFile = { filePath: "", hunks: [] };
      continue;
    }

    if (!currentFile) continue;

    if (line.startsWith("+++ ")) {
      const path = line.slice(4);
      if (path !== "/dev/null") {
        currentFile.filePath = path.startsWith("b/") ? path.slice(2) : path;
      }
      continue;
    }

    const header = HUNK_HEADER.exec(line);
    if (header) {
      finishHunk();
      currentHunk = {
        oldStart: Number(header[1]),
        oldLines: Number(header[2] ?? 1),
        newStart: Number(header[3]),
        newLines: Number(header[4] ?? 1),
        content: line
      };
      continue;
    }

    if (currentHunk) currentHunk.content += `\n${line}`;
  }

  finishHunk();
  if (currentFile) files.push(currentFile);

  return files.filter((file) => file.filePath.length > 0 && file.hunks.length > 0);
}
