'use client';

import { registerHelpTopics } from './registry';
import { analyzeTopics } from './content/analyze';

registerHelpTopics(analyzeTopics);
