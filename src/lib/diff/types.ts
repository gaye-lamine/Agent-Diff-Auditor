export interface DiffHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  content: string;
}

export interface ParsedDiffFile {
  filePath: string;
  hunks: DiffHunk[];
}
