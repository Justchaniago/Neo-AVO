import Link from "next/link";
import { Empty } from "./ui/primitives";
export default function NotFound() {
  return (
    <>
      <Empty title="Surface not found">
        This page does not exist in the console.
      </Empty>
      <Link className="button" href="/">
        Return to overview ↗
      </Link>
    </>
  );
}
