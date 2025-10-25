import { createInterface } from 'readline/promises';
import { stdin as input, stdout as output } from 'process';

/**
 * Ask a yes/no question and return true for yes, false for no.
 * TTY-safe: only works in interactive terminal.
 *
 * @param question The question to ask (will append " (y/N): ")
 * @returns Promise resolving to true for 'y'/'yes', false otherwise
 */
export async function askYesNo(question: string): Promise<boolean> {
  const rl = createInterface({ input, output });

  try {
    const answer = await rl.question(`${question} (y/N): `);
    return answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes';
  } finally {
    rl.close();
  }
}
