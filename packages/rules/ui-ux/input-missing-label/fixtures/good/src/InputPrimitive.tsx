import * as React from "react";

// Real-world false positive found during calibration (DECISIONS/0014):
// a reusable Input primitive (shadcn/ui's own component, verbatim shape)
// spreads the caller's props, which is where id/aria-label actually
// live — invisible to structural matching without the spread exemption.
export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => {
    return <input type={type} className={className} ref={ref} {...props} />;
  },
);
Input.displayName = "Input";
