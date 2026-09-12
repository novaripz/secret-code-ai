"use client";

// Create and edit one assignment. `new` is the create route rather than a
// separate page, because the form is identical and two copies would drift —
// the only difference is whether there is a row to update.

import { use } from "react";
import { TeacherPage } from "@/components/teacher/TeacherPage";
import { AssignmentEditor } from "@/components/teacher/AssignmentEditor";

export default function AssignmentEditorPage({
  params,
}: {
  params: Promise<{ classId: string; assignmentId: string }>;
}) {
  const { classId, assignmentId } = use(params);
  return (
    <TeacherPage>
      <AssignmentEditor classId={classId} assignmentId={assignmentId === "new" ? null : assignmentId} />
    </TeacherPage>
  );
}
