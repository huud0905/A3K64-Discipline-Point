// Temporary runtime bridge while taskViewEnhancer.ts is split safely.
// The source file is still at src/taskViewEnhancer.ts because it contains a long
// compressed CSS/runtime block. Move it only after the content can be copied
// without truncation.
import '../../../taskViewEnhancer';

export {};
