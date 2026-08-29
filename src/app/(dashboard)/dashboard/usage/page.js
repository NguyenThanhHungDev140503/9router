"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { UsageStats, RequestLogger, CardSkeleton, SegmentedControl } from "@/shared/components";
import RequestDetailsTab from "./components/RequestDetailsTab";

const PERIODS = [
  { value: "today", label: "Today" },
  { value: "24h", label: "24h" },
  { value: "7d", label: "7D" },
  { value: "30d", label: "30D" },
  { value: "60d", label: "60D" },
];

export default function UsagePage() {
  return (
    <Suspense fallback={<CardSkeleton />}>
      <UsageContent />
    </Suspense>
  );
}

function UsageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [period, setPeriod] = useState("today");
  const [isAdmin, setIsAdmin] = useState(false);
  const [users, setUsers] = useState([]);

  const tabFromUrl = searchParams.get("tab");
  const activeTab = tabFromUrl && ["overview", "logs", "details"].includes(tabFromUrl)
    ? tabFromUrl
    : "overview";
  const selectedUserId = searchParams.get("userId") || "all";

  useEffect(() => {
    let cancelled = false;

    async function loadUsersForAdmin() {
      try {
        const authResponse = await fetch("/api/auth/status", { cache: "no-store" });
        if (!authResponse.ok) return;

        const authStatus = await authResponse.json();
        if (cancelled || !authStatus?.isAdmin) return;

        setIsAdmin(true);
        const usersResponse = await fetch("/api/users?isActive=true");
        if (!usersResponse.ok) return;

        const usersData = await usersResponse.json();
        if (!cancelled) setUsers(usersData?.users || []);
      } catch {
        // Keep selector hidden when auth or user loading fails.
      }
    }

    loadUsersForAdmin();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleTabChange = (value) => {
    if (value === activeTab) return;
    const params = new URLSearchParams(searchParams);
    params.set("tab", value);
    router.push(`/dashboard/usage?${params.toString()}`, { scroll: false });
  };

  const handleUserChange = (event) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("userId", event.target.value);
    router.push(`/dashboard/usage?${params.toString()}`, { scroll: false });
  };

  return (
    <div className="flex min-w-0 flex-col gap-6 px-1 sm:px-0">
      {/* Tabs + filters on same row */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <SegmentedControl
          options={[
            { value: "overview", label: "Overview" },
            { value: "details", label: "Details" },
          ]}
          value={activeTab}
          onChange={handleTabChange}
          className="w-full sm:w-auto"
        />
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
          {isAdmin && (
            <div className="relative w-full sm:w-auto">
              <select
                value={selectedUserId}
                onChange={handleUserChange}
                aria-label="Filter usage by user"
                className="w-full appearance-none rounded-[10px] border border-transparent bg-surface-2 py-2.5 pl-3 pr-10 text-[16px] text-text-main transition-all duration-150 focus:border-brand-500/40 focus:outline-none focus:ring-2 focus:ring-brand-500/30 sm:w-auto sm:text-sm"
              >
                <option value="all">All Users</option>
                <option value="unassigned">Unassigned / System</option>
                {users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.username} ({user.role})
                  </option>
                ))}
              </select>
              <span className="material-symbols-outlined pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-[20px] text-text-muted">
                expand_more
              </span>
            </div>
          )}
          {activeTab === "overview" && (
            <SegmentedControl
              options={PERIODS}
              value={period}
              onChange={setPeriod}
              size="sm"
              className="w-full sm:w-auto"
            />
          )}
        </div>
      </div>

      {activeTab === "overview" && (
        <Suspense fallback={<CardSkeleton />}>
          <UsageStats period={period} setPeriod={setPeriod} hidePeriodSelector />
        </Suspense>
      )}
      {activeTab === "logs" && <RequestLogger />}
      {activeTab === "details" && <RequestDetailsTab />}
    </div>
  );
}
