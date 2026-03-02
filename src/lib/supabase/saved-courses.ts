import { createClient } from "./server";

export interface SavedCourse {
  id: string;
  user_id: string;
  university: string;
  course_code: string;
  year: number;
  semester: string;
  delivery: string;
  created_at: string;
}

export async function getSavedCourses(): Promise<SavedCourse[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) return [];

  const { data, error } = await supabase
    .from("saved_courses")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching saved courses:", error);
    return [];
  }

  return data ?? [];
}

export async function saveCourse(course: {
  university: string;
  course_code: string;
  year: number;
  semester: string;
  delivery: string;
}): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "Not authenticated" };
  }

  const { error } = await supabase.from("saved_courses").upsert(
    {
      user_id: user.id,
      university: course.university,
      course_code: course.course_code,
      year: course.year,
      semester: course.semester,
      delivery: course.delivery,
    },
    {
      onConflict: "user_id,university,course_code,year,semester,delivery",
    }
  );

  if (error) {
    console.error("Error saving course:", error);
    return { success: false, error: error.message };
  }

  return { success: true };
}

export async function removeSavedCourse(id: string): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "Not authenticated" };
  }

  const { error } = await supabase
    .from("saved_courses")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    console.error("Error removing saved course:", error);
    return { success: false, error: error.message };
  }

  return { success: true };
}

export async function getUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
}
