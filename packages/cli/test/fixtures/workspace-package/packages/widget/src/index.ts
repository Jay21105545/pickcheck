// Declared by this package itself — resolvable from either scan root.
import { debounce } from "lodash";
// Declared nowhere: the positive control that keeps the fixture honest.
// If walking above the scan root ever stopped being bounded, whatever it
// swept up would have to make this one disappear too.
import { render } from "totally-not-a-real-package";

export const boot = debounce(render, 100);
