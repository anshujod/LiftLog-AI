import { WorkoutDetail } from "@/components/WorkoutDetail";

export default async function WorkoutDetailPage(props: PageProps<"/workout/[id]">) {
  const { id } = await props.params;
  return <WorkoutDetail key={id} workoutId={id} />;
}
