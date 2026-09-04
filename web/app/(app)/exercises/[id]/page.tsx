import { ExerciseDetail } from "@/components/ExerciseDetail";

export default async function ExerciseDetailPage(props: PageProps<"/exercises/[id]">) {
  const { id } = await props.params;
  return <ExerciseDetail key={id} exerciseId={id} />;
}
