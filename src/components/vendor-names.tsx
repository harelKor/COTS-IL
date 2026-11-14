import { Fragment } from "react";
import { Ltr } from "./ltr";

/** Vendor names in running text, as a Hebrew list ("A, B ו-C"), each name in <Ltr>. */
export function VendorNames({ names }: { names: readonly string[] }) {
  return names.map((name, i) => (
    <Fragment key={name}>
      {i > 0 && (i === names.length - 1 ? " ו-" : ", ")}
      <Ltr>{name}</Ltr>
    </Fragment>
  ));
}
