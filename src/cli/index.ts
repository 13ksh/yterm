import { HELP, parseArgs } from "./args"
import { play } from "./player"

async function main(): Promise<void> {
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
    const code = await play(opts)
    process.exitCode = code
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    process.stderr.write(`${message}\n`)
    process.exitCode = 1
  }
}

void main()
