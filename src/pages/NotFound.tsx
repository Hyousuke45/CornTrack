import { Link } from "wouter";
import { Compass } from "lucide-react";

export default function NotFound() {
  return (
    <div className="page-enter text-center">
      <div className="empty-state">
        <div className="empty-icon">
          <Compass size={22} />
        </div>
        <b className="text-sm text-[#3d5245]">Page not found</b>
        <p className="mt-1 text-xs">The page you are looking for does not exist.</p>
      </div>
      <Link href="/" className="btn-primary mt-2 inline-flex">
        Back to Home
      </Link>
    </div>
  );
}
