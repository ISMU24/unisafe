import express from 'express';
import path from 'node:path';
import fs from 'node:fs/promises';

// Public documents only. Reject directories, traversal and non-PDF files before
// opening a stream; sendFile's callback also handles errors after the stat check.
export function policyRoutes(directory) {
  const router = express.Router();
  router.get('/:folder/:filename', async (req, res, next) => {
    const { folder, filename } = req.params;
    if ([folder, filename].some(part => !part || part === '.' || part === '..' || /[\\/\0]/.test(part))
      || path.extname(filename).toLowerCase() !== '.pdf') {
      return res.status(404).json({ error: 'Policy not found.' });
    }
    try {
      const root = await fs.realpath(directory);
      const target = await fs.realpath(path.join(root, folder, filename));
      const relative = path.relative(root, target);
      if (relative.startsWith('..') || path.isAbsolute(relative) || !(await fs.stat(target)).isFile()) {
        return res.status(404).json({ error: 'Policy not found.' });
      }
      res.type('pdf');
      res.sendFile(target, error => { if (error) next(error); });
    } catch (error) {
      if (['ENOENT', 'ENOTDIR', 'EISDIR'].includes(error.code)) return res.status(404).json({ error: 'Policy not found.' });
      next(error);
    }
  });
  return router;
}
