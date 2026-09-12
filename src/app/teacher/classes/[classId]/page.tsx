"use client";

// One class, overview tab. `params` is a promise in this version of Next, so it
// is unwrapped with React's `use` the same way the student class pages do it.

import { use } from "react";
import { TeacherPage } from "@/components/teacher/TeacherPage";
import { ClassFrame } from "@/components/teacher/ClassFrame";
import { OverviewView } from "@/components/teacher/OverviewView";

export default function ClassOverviewPage({ params }: { params: Promise<{ classId: string }> }) {
  const { classId } = use(params);
  return (
    <TeacherPage>
      <ClassFrame classId={classId}>
        <OverviewView classId={classId} />
      </ClassFrame>
    </TeacherPage>
  );
}
