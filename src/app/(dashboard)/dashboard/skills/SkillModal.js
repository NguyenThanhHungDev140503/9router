"use client";

import { useState, useEffect } from "react";
import { Modal, Input, Button, Toggle } from "@/shared/components";
import { useNotificationStore } from "@/store/notificationStore";

export default function SkillModal({ isOpen, onClose, skill, onSaved }) {
  const isEdit = !!skill;
  const { error: toastError, success: toastSuccess } = useNotificationStore();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [tagsText, setTagsText] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (skill) {
      setName(skill.name || "");
      setDescription(skill.description || "");
      setSystemPrompt(skill.systemPrompt || "");
      setTagsText(Array.isArray(skill.tags) ? skill.tags.join(", ") : (typeof skill.tags === "string" ? skill.tags : ""));
      setEnabled(skill.enabled !== false);
    } else {
      setName("");
      setDescription("");
      setSystemPrompt("");
      setTagsText("");
      setEnabled(true);
    }
  }, [skill, isOpen]);

  const handleSave = async () => {
    if (!name.trim()) {
      toastError("Skill name is required");
      return;
    }
    if (!systemPrompt.trim()) {
      toastError("System prompt is required");
      return;
    }

    setSaving(true);
    try {
      const parsedTags = tagsText
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);

      const payload = {
        name: name.trim(),
        description: description.trim(),
        systemPrompt: systemPrompt.trim(),
        tags: parsedTags,
        enabled,
      };

      const endpoint = isEdit ? `/api/skills/${skill.id}` : "/api/skills";
      const method = isEdit ? "PUT" : "POST";

      const res = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      let data;
      try {
        data = await res.json();
      } catch {
        const text = await res.text().catch(() => "");
        data = { error: text || `HTTP ${res.status}: Failed to save skill` };
      }
      if (!res.ok) throw new Error((typeof data.error === "object" ? data.error?.message : data.error) || "Failed to save skill");

      toastSuccess(isEdit ? "Skill updated successfully" : "Skill created successfully");
      onSaved(data.skill);
      onClose();
    } catch (err) {
      toastError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEdit ? `Edit Skill: ${skill.name}` : "Create Custom Skill"}
      size="lg"
    >
      <div className="flex flex-col gap-4">
        <Input
          label="Skill Name"
          placeholder="e.g. Code Reviewer, SQL Optimizer"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />

        <Input
          label="Description"
          placeholder="Short description of what this skill does"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-text-main">
            System Prompt <span className="text-red-500">*</span>
          </label>
          <textarea
            rows={6}
            placeholder="Instructions injected into model requests when this skill is active..."
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            className="w-full py-2.5 px-3 text-xs font-mono text-text-main bg-surface-2 rounded-[10px] border border-transparent focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500/40"
          />
        </div>

        <Input
          label="Tags (Comma-separated)"
          placeholder="coding, sql, analysis"
          value={tagsText}
          onChange={(e) => setTagsText(e.target.value)}
        />

        <div className="pt-2">
          <Toggle
            label="Enable Skill"
            description="When enabled, this skill prompt is injected according to gateway rules or requests."
            checked={enabled}
            onChange={setEnabled}
          />
        </div>

        <div className="flex items-center justify-end gap-2 pt-4 border-t border-border-subtle">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleSave} loading={saving}>
            {isEdit ? "Save Changes" : "Create Skill"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
