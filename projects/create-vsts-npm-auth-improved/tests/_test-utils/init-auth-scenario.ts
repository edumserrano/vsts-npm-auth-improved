import { InitAuthCommand } from "./init-auth-command";
import { NpmProject } from "./npm-project";
import { PromptsInteraction } from "./prompts-interaction";
import { mockStdoutWrite, OutputChannelCapture } from "./process-output";

export type SinglePackageScenarioOptions = {
  readonly name: string;
  readonly npmrc?: string;
  readonly packageInstallationStrategy?: "standard-npm-install" | "custom-install-packages";
  readonly packageJson: string;
  readonly promptedRegistry?: string;
};

export async function runSinglePackageScenarioAsync({
  name,
  npmrc,
  packageInstallationStrategy = "standard-npm-install",
  packageJson,
  promptedRegistry,
}: SinglePackageScenarioOptions): Promise<{
  readonly output: OutputChannelCapture;
  readonly project: NpmProject;
}> {
  const project = await NpmProject.createAsync(name);
  await project.createPackageAsync({ packageJson, npmrc });
  const output = mockStdoutWrite({
    temporaryRoots: [project.root],
  });
  process.chdir(project.root);
  const command = InitAuthCommand.invokeAsync();
  const interaction = new PromptsInteraction()
    .submitText()
    .down()
    .toggleMultiselectItem()
    .acceptMultiselectValues();
  if (packageInstallationStrategy === "custom-install-packages") {
    interaction.down();
  }
  interaction.acceptSelectValue();
  if (promptedRegistry !== undefined) {
    interaction.enterText(promptedRegistry).submitText();
  }
  await interaction;
  await command;

  return { output, project };
}

export function restoreCapturedOutput(output: OutputChannelCapture): void {
  output.write.mockRestore();
}
