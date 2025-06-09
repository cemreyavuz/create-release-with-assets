const { getInput, setFailed } = require("@actions/core");
const { context, getOctokit } = require("@actions/github");
const { readFileSync } = require("fs");
const { basename } = require("path");

const run = async () => {
  try {
    const filesRaw = getInput("files", { required: true });
    const githubToken = getInput("token", { required: true });
    const tag = getInput("tag", { required: true });

    // initialize octokit
    const octokit = getOctokit(githubToken);

    // list of files to be uploaded
    const files = filesRaw.split("\n");
    console.log(`Files to upload: ${files}`);
    if (files.length === 0 || files.every((f) => f.trim() === "")) {
      throw new Error("No files specified for upload.");
    }
    console.log(`Tag: ${tag}`);

    // check if a release with the specified tag already exists
    try {
      // attempt to get the release by tag
      const result = await octokit.rest.repos.getReleaseByTag({
        owner: context.repo.owner,
        repo: context.repo.repo,
        tag: tag,
      });
      console.log(`Found existing release with tag ${tag}.`);

      // TODO(cemreyavuz): check if the existing release is a draft
      if (result.status === 200) {
        throw new Error("Release already exists with the specified tag.");
      }
    } catch (error) {
      if (error.status === 404) {
        // if the release does not exist, log a message
        console.log(`No existing release found with tag ${tag}.`);
      } else {
        // if there is another error, throw the error
        throw error;
      }
    }

    // if the release does not exist, create a new draft release
    const release = await octokit.rest.repos
      .createRelease({
        owner: context.repo.owner,
        repo: context.repo.repo,
        tag_name: tag,
        name: tag,
        body: `Release notes for ${tag}`,
        draft: true,
        prerelease: true,
      })
      .then((r) => r.data);
    console.log(`Created new draft release with tag ${tag}.`);

    const releaseId = release.id;
    console.log(
      `Uploading files to release:\n- Release ID: ${releaseId}\n- Release URL: ${release.html_url}`
    );

    // upload release assets
    for (const fileRaw of files) {
      console.log(`Processing file: "${fileRaw}"`);

      console.log("Trimming file path");
      const file = fileRaw.trim();

      // skip empty file paths
      if (!file) {
        console.log("Skipping empty file path");
        continue;
      }

      console.log(`Uploading file: ${file}`);
      const fileContent = readFileSync(file);
      await octokit.rest.repos.uploadReleaseAsset({
        owner: context.repo.owner,
        repo: context.repo.repo,
        release_id: releaseId,
        name: basename(file),
        data: fileContent,
      });

      console.log(`Uploaded file: ${file}`);
    }

    // mark the release as production-ready (draft: false)
    console.log(`Marking release as production-ready: ${releaseId}`);
    await octokit.rest.repos.updateRelease({
      owner: context.repo.owner,
      repo: context.repo.repo,
      release_id: releaseId,
      draft: false,
      prerelease: false,
      make_latest: true,
    });

    console.log(`Release marked as production-ready: ${releaseId}`);
  } catch (error) {
    if (error instanceof Error && typeof error.message === "string") {
      setFailed(error.message);
    } else {
      console.log(error);
      setFailed("Unknown error");
    }
  }
};

run();
