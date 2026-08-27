"use client";

import { useState, useEffect, useCallback } from "react";
import Button from "@/shared/components/Button";
import Modal, { ConfirmModal } from "@/shared/components/Modal";
import Input from "@/shared/components/Input";
import Select from "@/shared/components/Select";
import Badge from "@/shared/components/Badge";

export default function UsersPageClient() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");

  // Modal states
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [deletingUser, setDeletingUser] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Form states
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("user");
  const [isActive, setIsActive] = useState(true);
  const [formError, setFormError] = useState("");

  const fetchUsers = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/users");
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to fetch users");
      }
      setUsers(data.users || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const resetForm = () => {
    setUsername("");
    setPassword("");
    setRole("user");
    setIsActive(true);
    setFormError("");
  };

  const handleOpenAdd = () => {
    resetForm();
    setIsAddModalOpen(true);
  };

  const handleOpenEdit = (user) => {
    setEditingUser(user);
    setUsername(user.username);
    setPassword("");
    setRole(user.role);
    setIsActive(user.isActive);
    setFormError("");
  };

  const handleSaveUser = async (e) => {
    e?.preventDefault();
    setFormError("");
    setActionLoading(true);

    try {
      if (editingUser) {
        // Edit user
        const updatePayload = {
          username: username.trim(),
          role,
          isActive,
        };
        if (password.trim()) {
          updatePayload.password = password.trim();
        }

        const res = await fetch(`/api/users/${editingUser.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(updatePayload),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to update user");

        setEditingUser(null);
        fetchUsers();
      } else {
        // Create user
        if (!username.trim() || !password.trim()) {
          throw new Error("Username and password are required");
        }

        const res = await fetch("/api/users", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            username: username.trim(),
            password: password.trim(),
            role,
            isActive,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to create user");

        setIsAddModalOpen(false);
        fetchUsers();
      }
    } catch (err) {
      setFormError(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteUser = async () => {
    if (!deletingUser) return;
    setActionLoading(true);
    try {
      const res = await fetch(`/api/users/${deletingUser.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to delete user");

      setDeletingUser(null);
      fetchUsers();
    } catch (err) {
      alert(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const filteredUsers = users.filter((u) =>
    u.username.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6 max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-text-main flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-28px">group</span>
            User Management
          </h1>
          <p className="text-sm text-text-muted mt-1">
            Manage users, assign roles, and control access permissions
          </p>
        </div>
        <Button onClick={handleOpenAdd} variant="primary" className="flex items-center gap-2">
          <span className="material-symbols-outlined text-18px">person_add</span>
          Add User
        </Button>
      </div>

      {/* Filter / Search Bar */}
      <div className="flex items-center gap-4 bg-surface border border-border rounded-xl p-4 shadow-sm">
        <div className="relative flex-1">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-text-muted text-18px pointer-events-none">
            search
          </span>
          <input
            type="text"
            placeholder="Search by username..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-surface-2 border border-border rounded-lg text-sm text-text-main focus:outline-none focus:border-primary/50 transition-colors"
          />
        </div>
      </div>

      {/* Users List */}
      {loading ? (
        <div className="flex items-center justify-center p-12 text-text-muted">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mr-3"></div>
          Loading users...
        </div>
      ) : error ? (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-6 text-center text-red-500">
          <span className="material-symbols-outlined text-4xl mb-2">error</span>
          <p className="font-semibold">{error}</p>
        </div>
      ) : filteredUsers.length === 0 ? (
        <div className="bg-surface border border-border rounded-xl p-12 text-center text-text-muted">
          <span className="material-symbols-outlined text-4xl mb-2 text-text-muted/60">person_off</span>
          <p className="text-base font-medium">No users found</p>
          <p className="text-xs mt-1">Click Add User above to create a new user</p>
        </div>
      ) : (
        <div className="bg-surface border border-border rounded-xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-surface-2 border-b border-border text-text-muted uppercase text-xs">
                <tr>
                  <th className="px-6 py-3 font-semibold">User</th>
                  <th className="px-6 py-3 font-semibold">Role</th>
                  <th className="px-6 py-3 font-semibold">Status</th>
                  <th className="px-6 py-3 font-semibold">Created At</th>
                  <th className="px-6 py-3 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredUsers.map((user) => (
                  <tr key={user.id} className="hover:bg-surface-2/50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-sm">
                          {user.username.slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <div className="font-medium text-text-main">{user.username}</div>
                          <div className="text-xs text-text-muted font-mono">{user.id}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                          user.role === "admin"
                            ? "bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20"
                            : "bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20"
                        }`}
                      >
                        {user.role}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                          user.isActive
                            ? "bg-green-500/10 text-green-600 dark:text-green-400 border border-green-500/20"
                            : "bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20"
                        }`}
                      >
                        {user.isActive ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-text-muted">
                      {new Date(user.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleOpenEdit(user)}
                          className="p-1.5 rounded-lg text-text-muted hover:text-primary hover:bg-primary/10 transition-colors"
                          title="Edit User"
                        >
                          <span className="material-symbols-outlined text-18px">edit</span>
                        </button>
                        <button
                          onClick={() => setDeletingUser(user)}
                          className="p-1.5 rounded-lg text-text-muted hover:text-red-500 hover:bg-red-500/10 transition-colors"
                          title="Delete User"
                        >
                          <span className="material-symbols-outlined text-18px">delete</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add / Edit User Modal */}
      <Modal
        isOpen={isAddModalOpen || !!editingUser}
        onClose={() => {
          setIsAddModalOpen(false);
          setEditingUser(null);
        }}
        title={editingUser ? `Edit User: ${editingUser.username}` : "Add New User"}
      >
        <form onSubmit={handleSaveUser} className="space-y-4">
          {formError && (
            <div className="p-3 text-xs bg-red-500/10 border border-red-500/30 text-red-500 rounded-lg">
              {formError}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-text-muted uppercase mb-1.5">
              Username
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="e.g. alice"
              required
              className="w-full px-3 py-2 bg-surface-2 border border-border rounded-lg text-sm text-text-main focus:outline-none focus:border-primary/50 transition-colors"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-text-muted uppercase mb-1.5">
              {editingUser ? "New Password (leave blank to keep unchanged)" : "Password"}
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={editingUser ? "••••••••" : "Enter password"}
              required={!editingUser}
              className="w-full px-3 py-2 bg-surface-2 border border-border rounded-lg text-sm text-text-main focus:outline-none focus:border-primary/50 transition-colors"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-text-muted uppercase mb-1.5">
              Role
            </label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="w-full px-3 py-2 bg-surface-2 border border-border rounded-lg text-sm text-text-main focus:outline-none focus:border-primary/50 transition-colors"
            >
              <option value="user">User (Isolated access to own keys & providers)</option>
              <option value="admin">Admin (Full administrative access)</option>
            </select>
          </div>

          <div className="flex items-center gap-2 pt-2">
            <input
              type="checkbox"
              id="isActive"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="rounded border-border text-primary focus:ring-primary h-4 w-4"
            />
            <label htmlFor="isActive" className="text-sm font-medium text-text-main cursor-pointer">
              Active account
            </label>
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setIsAddModalOpen(false);
                setEditingUser(null);
              }}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={actionLoading}>
              {actionLoading ? "Saving..." : editingUser ? "Save Changes" : "Create User"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Delete User Confirmation Modal */}
      <ConfirmModal
        isOpen={!!deletingUser}
        onClose={() => setDeletingUser(null)}
        onConfirm={handleDeleteUser}
        title="Delete User"
        message={`Are you sure you want to delete user "${deletingUser?.username}"? All associated API keys, connections, and usage history for this user will be removed.`}
        confirmText="Delete"
        variant="danger"
        loading={actionLoading}
      />
    </div>
  );
}
