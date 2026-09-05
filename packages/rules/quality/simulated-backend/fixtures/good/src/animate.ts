// An awaited delay in a file with no submit handler at all. Sequencing an
// animation this way is ordinary; the `when` precondition is what keeps
// the rule off it.
export async function playIntro(setStep) {
  setStep(1);
  await new Promise((resolve) => setTimeout(resolve, 300));
  setStep(2);
  await new Promise((resolve) => setTimeout(resolve, 300));
  setStep(3);
}
