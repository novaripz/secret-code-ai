"use client";

// The roster tab. Adding a student is one-sided by design — see RosterView.

import { use } from "react";
import { TeacherPage } from "@/components/teacher/TeacherPage";
import { ClassFrame } from "@/components/teacher/ClassFrame";
import { RosterView } from "@/components/teacher/RosterView";

export default function RosterPage({ params }: { params: Promise<{ classId: string }> }) {
  const { classId } = use(params);
  return (
    <TeacherPage>
      <ClassFrame classId={classId}>
        <RosterView classId={classId} />
      </ClassFrame>
    </TeacherPage>
  );
}
