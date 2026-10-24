export function Brand() {
  return (
    <div className="flex shrink-0 items-center gap-2.5">
      <img
        className="size-6 shrink-0 [filter:var(--brand-filter)]"
        src="/peek-mark.svg"
        alt=""
        width={24}
        height={24}
      />
      <span className="-translate-y-px text-2xl leading-6 font-semibold tracking-tight">
        peek
      </span>
    </div>
  );
}
