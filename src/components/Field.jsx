// Label + control wrapper. Pass `as="select"` for selects; children become options.
export default function Field({ label, help, as = "input", id, name, children, className = "", ...props }) {
  const controlId = id || name;
  const Control = as;
  return (
    <label className={`field ${className}`.trim()} htmlFor={controlId}>
      {label ? <span className="field__label">{label}</span> : null}
      <Control id={controlId} name={name} {...props}>
        {children}
      </Control>
      {help ? <span className="field__help">{help}</span> : null}
    </label>
  );
}
