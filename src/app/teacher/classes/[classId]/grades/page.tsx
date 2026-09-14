"use client";

// The gradebook tab: weights, the entry grid, and where everyone stands.

import { use } from "react";
import { TeacherPage } from "@/components/teacher/TeacherPage";
import { ClassFrame } from "@/components/teacher/ClassFrame";
import { GradesView } from "@/components/teacher/GradesView";

export default function GradesPage({ params }: { params: Promise<{ classId: string }> }) {
  const { classId } = use(params);
  return (
    <TeacherPage>
      <ClassFrame classId={classId}>
        <GradesView classId={classId} />
      </ClassFrame>
    </TeacherPage>
  );
}
