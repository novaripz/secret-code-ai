"use client";

// The assignments tab: the list, with each assignment's rules on its row.

import { use } from "react";
import { TeacherPage } from "@/components/teacher/TeacherPage";
import { ClassFrame } from "@/components/teacher/ClassFrame";
import { AssignmentsView } from "@/components/teacher/AssignmentsView";

export default function AssignmentsPage({ params }: { params: Promise<{ classId: string }> }) {
  const { classId } = use(params);
  return (
    <TeacherPage>
      <ClassFrame classId={classId}>
        <AssignmentsView classId={classId} />
      </ClassFrame>
    </TeacherPage>
  );
}
