import { LANGUAGES, type LanguageCode } from "@/lib/languages";
import type { Role } from "@/lib/types/conversation";
import { SwapIcon } from "./icons";

function Selector({
  role,
  value,
  onChange,
  disabled,
}: {
  role: Role;
  value: LanguageCode;
  onChange: (code: LanguageCode) => void;
  disabled: boolean;
}) {
  const title = role === "customer" ? "Customer" : "Vendor";
  return (
    <label className="block min-w-0 flex-1">
      <span className={`mb-1 block text-xs font-semibold ${role === "customer" ? "text-customer" : "text-vendor"}`}>
        {title} speaks
      </span>
      <select
        aria-label={`${title} language`}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value as LanguageCode)}
        className="w-full truncate rounded-xl border border-line bg-raised px-2 py-2.5 text-[0.8rem] font-semibold text-text disabled:opacity-60 sm:px-3 sm:text-sm"
      >
        {LANGUAGES.map((l) => (
          <option key={l.code} value={l.code}>
            {l.native === l.name ? l.name : `${l.native} · ${l.name}`}
          </option>
        ))}
      </select>
    </label>
  );
}

export function LanguagePairBar({
  customerLang,
  vendorLang,
  onChange,
  onSwap,
  disabled,
}: {
  customerLang: LanguageCode;
  vendorLang: LanguageCode;
  onChange: (role: Role, code: LanguageCode) => void;
  onSwap: () => void;
  disabled: boolean;
}) {
  return (
    <div className="mx-auto mb-4 flex max-w-2xl items-end gap-1.5 rounded-2xl border border-line bg-surface p-2.5 shadow-lg shadow-black/20 sm:gap-3 sm:p-4">
      <Selector role="customer" value={customerLang} onChange={(c) => onChange("customer", c)} disabled={disabled} />
      <button
        type="button"
        onClick={onSwap}
        disabled={disabled}
        aria-label="Swap languages"
        className="mb-0.5 flex size-9 shrink-0 items-center sm:size-10 justify-center rounded-full border border-line bg-raised text-muted hover:text-text disabled:opacity-50"
      >
        <SwapIcon className="size-4" />
      </button>
      <Selector role="vendor" value={vendorLang} onChange={(c) => onChange("vendor", c)} disabled={disabled} />
    </div>
  );
}
