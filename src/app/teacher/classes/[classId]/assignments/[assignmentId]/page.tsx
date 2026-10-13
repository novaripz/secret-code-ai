"use client";

// Create and edit one assignment. `new` is the create route rather than a
// separate page, because the form is identical and two copies would drift —
// the only difference is whether there is a row to update.
//
// Inside the class frame, under the Assignments section, so a teacher editing
// an assignment can see which class it is in and get anywhere else in it in
// one tap. The frame also loads the class, which is what lets this form open
// straight from a bookmark with the assignment already in it.

import { use } from "react";
import { TeacherPage } from "@/components/teacher/TeacherPage";
import { ClassFrame } from "@/components/teacher/ClassFrame";
import { AssignmentEditor } from "@/components/teacher/AssignmentEditor";

export default function AssignmentEditorPage({ params }: { params: Promise<{ classId: string; assignmentId: string }> }) {
  const { classId, assignmentId } = use(params);
  return (
    <TeacherPage>
      <ClassFrame classId={classId}>
        <AssignmentEditor classId={classId} assignmentId={assignmentId === "new" ? null : assignmentId} />
      </ClassFrame>
    </TeacherPage>
  );
}
