/**
 * MCP Prompts - Pre-configured prompt templates
 */

export interface PromptDefinition {
  name: string;
  description?: string;
  arguments?: Array<{
    name: string;
    description?: string;
    required?: boolean;
  }>;
}

export interface PromptMessage {
  role: 'user' | 'assistant';
  content: {
    type: 'text';
    text: string;
  };
}

export function getPromptDefinitions(): PromptDefinition[] {
  return [
    {
      name: 'analyze_codebase',
      description: 'Analyze codebase structure and provide overview',
      arguments: [
        {
          name: 'path',
          description: 'Root directory to analyze',
          required: true,
        },
      ],
    },
    {
      name: 'setup_python_env',
      description: 'Interactive Python development environment setup',
      arguments: [],
    },
    {
      name: 'search_and_replace',
      description: 'Search for pattern and prepare replacement',
      arguments: [
        {
          name: 'pattern',
          description: 'Pattern to search for',
          required: true,
        },
        {
          name: 'path',
          description: 'Directory to search in',
          required: true,
        },
      ],
    },
  ];
}

export function getPromptMessages(
  name: string,
  args: Record<string, string>
): PromptMessage[] | null {
  switch (name) {
    case 'analyze_codebase': {
      const path = args.path || '.';
      return [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Please analyze the codebase at ${path}:

1. Use list_directory with recursive=true to get the structure
2. Identify key directories (src, tests, config)
3. Look for package.json, tsconfig.json, or similar config files using search_files
4. Provide a summary of:
   - Project type and tech stack
   - Directory structure
   - Main entry points
   - Testing setup
   - Build configuration`,
          },
        },
      ];
    }

    case 'setup_python_env': {
      return [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Set up an interactive Python development environment:

1. Use start_process to launch "python3 -i"
2. Import commonly used libraries:
   - import pandas as pd
   - import numpy as np
   - import matplotlib.pyplot as plt
3. Set up the environment with useful configurations
4. Return the PID for future interactions

The environment is ready for data analysis and exploration.`,
          },
        },
      ];
    }

    case 'search_and_replace': {
      const pattern = args.pattern || '<PATTERN>';
      const path = args.path || '.';

      return [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Search for "${pattern}" in ${path} and prepare for replacement:

1. Use search_files to find all occurrences of "${pattern}"
2. Show matches with context
3. Ask me what replacement text to use
4. Use edit_block to make precise replacements
5. Verify changes by reading the modified files

Safety: edit_block requires exact matches and will fail if ambiguous.`,
          },
        },
      ];
    }

    default:
      return null;
  }
}
