"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/", label: "勤怠打刻" },
  { href: "/overtime", label: "残業申請" },
  { href: "/admin", label: "管理" },
  { href: "/admin/settings", label: "設定" },
];

export function GlobalNav() {
  const pathname = usePathname();

  return (
    <header className="global-header">
      <span className="global-logo">勤怠管理</span>
      <nav className="global-nav">
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={pathname === item.href ? "nav-link nav-link-active" : "nav-link"}
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
