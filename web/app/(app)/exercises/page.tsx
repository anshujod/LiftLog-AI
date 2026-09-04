"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ExercisePicker } from "@/components/ExercisePicker";
import { AddExerciseSheet } from "@/components/AddExerciseSheet";
import type { Exercise } from "@/lib/api/exercises";

export default function ExercisesPage() {
  const router = useRouter();
  const [showAddSheet, setShowAddSheet] = useState(false);

  function goToExercise(exercise: Exercise) {
    router.push(`/exercises/${exercise.id}`);
  }

  return (
    <div className="flex flex-1 flex-col">
      <h1 className="px-4 pt-4 text-2xl font-semibold">Exercises</h1>
      <ExercisePicker variant="page" onSelect={goToExercise} onAddCustom={() => setShowAddSheet(true)} />
      {showAddSheet && (
        <AddExerciseSheet
          onClose={() => setShowAddSheet(false)}
          onCreated={(exercise) => {
            setShowAddSheet(false);
            goToExercise(exercise);
          }}
        />
      )}
    </div>
  );
}
