import { HELP, parseArgs } from "./args"
import { play } from "./player"
import { runTui } from "./tui"
import { enableVt } from "./vt"

async function main(): Promise<void> {
  enableVt()
  let opts
  try {
    opts = parseArgs(process.argv.slice(2))
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    process.stderr.write(`${message}\n\n${HELP}`)
    process.exitCode = 1
    return
  }

  if (opts.help) {
    process.stdout.write(HELP)
    return
  }

  try {
    const direct = Boolean(opts.target) || opts.frames != null
    const code = direct ? await play(opts) : await runTui(opts)
    process.exitCode = code
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    process.stderr.write(`${message}\n`)
    process.exitCode = 1
  }
}

void main()
