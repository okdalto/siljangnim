export default function SeparatorControl({ ctrl }) {
  return (
    <div className="pt-1">
      <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider border-b border-zinc-700 pb-1">
        {ctrl.label}
      </p>
    </div>
  );
}
