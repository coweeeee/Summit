import { Feather } from "@expo/vector-icons";
import React, { useState } from "react";
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import Colors from "@/constants/colors";
import { supabase } from "@/lib/supabase";

// One report sheet for every reportable thing.
//
// The reason list, the sheet markup, its styles and the insert were previously
// copy-pasted between the feed and hike detail, and profiles had no way to
// report at all. A third copy was the wrong answer.
//
// `reports` has three nullable target columns; exactly which one is set is what
// distinguishes a hike report from a comment report from an account report.
// reported_user_id is always set, so moderation can act on the author either way.

const REPORT_REASONS = ["Spam", "Harassment or bullying", "Inappropriate content", "Other"];

export type ReportTarget = {
  reportedUserId: string;
  hikeId?: string;
  commentId?: string;
  label: string;
};

export default function ReportModal({
  target,
  reporterId,
  onClose,
  onSubmitted,
}: {
  target: ReportTarget | null;
  reporterId: string | undefined;
  onClose: () => void;
  onSubmitted?: () => void;
}) {
  const [reason, setReason] = useState("");
  const [details, setDetails] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const close = () => {
    setReason("");
    setDetails("");
    onClose();
  };

  const submit = async () => {
    if (!reporterId || !target || !reason) return;
    setSubmitting(true);
    const { error } = await supabase.from("reports").insert({
      reporter_id: reporterId,
      reported_user_id: target.reportedUserId,
      hike_id: target.hikeId ?? null,
      comment_id: target.commentId ?? null,
      reason,
      details: details.trim() || null,
    });
    setSubmitting(false);
    // Previously the insert result was discarded, so a report blocked by RLS or
    // a dropped connection still showed the success toast.
    if (error) {
      setReason("");
      setDetails("");
      onClose();
      return;
    }
    close();
    onSubmitted?.();
  };

  return (
    <Modal visible={!!target} transparent animationType="fade" onRequestClose={close}>
      <Pressable style={styles.modalOverlay} onPress={close}>
        <Pressable style={styles.reportSheet} onPress={() => {}}>
          <Text style={styles.reportTitle}>{target?.label || "Report"}</Text>
          <Text style={styles.reportSub}>Why are you reporting this?</Text>
          {REPORT_REASONS.map(r => (
            <Pressable
              key={r}
              onPress={() => setReason(r)}
              style={[styles.reasonRow, reason === r && styles.reasonRowActive]}
            >
              <Text style={[styles.reasonText, reason === r && styles.reasonTextActive]}>{r}</Text>
              {reason === r && <Feather name="check" size={15} color={Colors.accent} />}
            </Pressable>
          ))}
          <TextInput
            style={styles.reportDetailsInput}
            placeholder="Additional details (optional)"
            placeholderTextColor={Colors.text3}
            value={details}
            onChangeText={setDetails}
            multiline
            maxLength={300}
          />
          <Pressable
            onPress={submit}
            disabled={!reason || submitting}
            style={[styles.submitReportBtn, (!reason || submitting) && { opacity: 0.5 }]}
          >
            <Text style={styles.submitReportText}>{submitting ? "Submitting…" : "Submit Report"}</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.65)", justifyContent: "flex-end" },
  reportSheet: { backgroundColor: Colors.bg2, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 40, gap: 4 },
  reportTitle: { fontFamily: "Inter_700Bold", fontSize: 17, color: Colors.text, marginBottom: 2 },
  reportSub: { fontFamily: "Inter_400Regular", fontSize: 13, color: Colors.text3, marginBottom: 12 },
  reasonRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 12, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, marginBottom: 6, backgroundColor: Colors.bg3 },
  reasonRowActive: { borderColor: Colors.accent, backgroundColor: "rgba(141,207,122,0.08)" },
  reasonText: { fontFamily: "Inter_500Medium", fontSize: 14, color: Colors.text2 },
  reasonTextActive: { color: Colors.accent, fontFamily: "Inter_600SemiBold" },
  reportDetailsInput: { marginTop: 8, backgroundColor: Colors.bg3, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, padding: 12, fontFamily: "Inter_400Regular", fontSize: 14, color: Colors.text, minHeight: 70, textAlignVertical: "top" },
  submitReportBtn: { marginTop: 14, backgroundColor: Colors.red, borderRadius: 12, paddingVertical: 14, alignItems: "center" },
  submitReportText: { fontFamily: "Inter_600SemiBold", fontSize: 15, color: "#fff" },
});
