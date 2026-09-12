"use client";

// The analytics tab: aggregate learning signals for the class, never transcripts.

import { use } from "react";
import { TeacherPage } from "@/components/teacher/TeacherPage";
import { ClassFrame } from "@/components/teacher/ClassFrame";
import { AnalyticsView } from "@/components/teacher/AnalyticsView";

export default function ClassAnalyticsPage({ params }: { params: Promise<{ classId: string }> }) {
  const { classId } = use(params);
  return (
    <TeacherPage>
      <ClassFrame classId={classId}>
        <AnalyticsView classId={classId} />
      </ClassFrame>
    </TeacherPage>
  );
}
