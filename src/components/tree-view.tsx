import { cn } from "@/lib/utils"

type TreeLine = {
  prefix: string
  author: string | null
  text: string
  isTitle: boolean
}

function parseLine(line: string, isTitle: boolean): TreeLine {
  if (isTitle) {
    return { prefix: "", author: null, text: line, isTitle: true }
  }

  const match = line.match(/^([│├└─\s]*)(@[^\s]+)?(.*)$/)
  if (!match) {
    return { prefix: "", author: null, text: line, isTitle: false }
  }

  return {
    prefix: match[1] ?? "",
    author: match[2] ?? null,
    text: match[3] ?? "",
    isTitle: false,
  }
}

export function TreeView({
  text,
  className,
}: {
  text: string
  className?: string
}) {
  const lines = text.split("\n")

  return (
    <pre
      className={cn(
        "min-h-[280px] overflow-auto p-4 font-mono text-[13px] leading-6 sm:p-5 sm:text-[13.5px]",
        className,
      )}
    >
      {lines.map((line, index) => {
        const parsed = parseLine(line, index === 0)
        return (
          <div key={`${index}-${line}`} className="whitespace-pre">
            {parsed.isTitle ? (
              <span className="font-medium text-zinc-50">{parsed.text}</span>
            ) : (
              <>
                <span className="text-zinc-500">{parsed.prefix}</span>
                {parsed.author ? (
                  <span className="font-medium text-rose-300">{parsed.author}</span>
                ) : null}
                <span className="text-zinc-200">{parsed.text.replace(/ · .+$/, "")}</span>
                {parsed.text.includes(" · ") ? (
                  <span className="text-amber-200/80">
                    {parsed.text.slice(parsed.text.lastIndexOf(" · "))}
                  </span>
                ) : null}
              </>
            )}
          </div>
        )
      })}
    </pre>
  )
}
