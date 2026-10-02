// The game's single entry point to the Pastel House Kit. The kit itself is vendored, untouched, in design/kit/
// (see design/README.md). roads.js is not exported yet; import it separately when the game needs roads.
import { ACTIONS as KIT_ACTIONS } from '../../design/kit/kit/kit.js';

export * from '../../design/kit/kit/kit.js';

// Kit 0.2 keeps 'work' as a legacy alias of 'hoe' but leaves it out of the label list; the game still uses 'work'.
export const ACTIONS = { ...KIT_ACTIONS, work: KIT_ACTIONS.work ?? KIT_ACTIONS.hoe };
