"use client";

// One student's learning signals. Deliberately not inside ClassFrame: this is a
// drill-down from the roster, not a fifth tab, and the breadcrumb says so.

import { use } from "react";
import { TeacherPage } from "@/components/teacher/TeacherPage";
import { StudentView } from "@/components/teacher/StudentView";

export default function StudentPage({
  params,
}: {
  params: Promise<{ classId: string; studentId: string }>;
}) {
  const { classId, studentId } = use(params);
  return (
    <TeacherPage>
      <StudentView classId={classId} studentId={studentId} />
    </TeacherPage>
  );
}
