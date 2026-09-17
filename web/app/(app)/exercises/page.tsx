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
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-5 px-4 pb-10 pt-4 md:max-w-3xl md:px-8">
      <div className="flex flex-col gap-1">
        <p className="eyebrow">Library — Movements</p>
        <h1 className="font-display text-[clamp(40px,9vw,64px)] leading-[0.9]">
          Exercises<span className="text-acid">.</span>
        </h1>
      </div>
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
