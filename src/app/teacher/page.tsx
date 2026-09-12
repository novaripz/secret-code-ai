"use client";

// /teacher — the teacher's own front door. Everything under here is gated by
// TeacherPage, which is the courtesy check; the database refuses the data
// regardless of what this component decides.

import { TeacherPage } from "@/components/teacher/TeacherPage";
import { ClassesView } from "@/components/teacher/ClassesView";

export default function TeacherHome() {
  return (
    <TeacherPage>
      <ClassesView />
    </TeacherPage>
  );
}
