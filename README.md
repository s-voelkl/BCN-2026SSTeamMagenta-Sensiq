# BCN-2026SSTeamMagenta-Sensiq

## License

The source files are licensed under the MIT License; the documentation is licensed under the Creative Commons Attribution 4.0 International License.

<!-- This repository is licensed under the MIT License. See the [LICENSE](LICENSE) file for more details.
The [documentation](doc/) is licensed under the Creative Commons Attribution 4.0 International License. See the [LICENSE](doc/LICENSE) file for more details. -->

## Project structure

<!-- For the recommended project structure, see the given [slides](https://moodle.oth-aw.de/pluginfile.php/480813/mod_resource/content/0/BCN_SU01_50_Benotung.pdf) on page 51. -->

## Test Coverage

## Hardware

### Example JSON Payload

```json
{
    "running_time":9881892,
    "timestamp":"2026-05-25T22:56:12Z",
    "device_id":"esp32-lab-001",
    "location":"Lab A, OTH Amberg-Weiden, 92224 Amberg, Germany",
    "dht_humidity":61,
    "dht_temperature":23.8,
    "dht_heat_index":23.82809,
    "flame_analog":0,
    "flame_digital":false,
    "thermistor_analog":2005,
    "thermistor_digital":false,
    "thermistor_temp":24.05634
}
```

## User Interface

### API Gateway
API Gateway Timeout: Denkt daran, dass AWS API Gateway ein unumstößliches Timeout von 29 Sekunden besitzt. Athena Queries sind asynchron. Ist die abgerufene Datenmenge beim handleHistoryData-Lambda zu groß und Athena braucht länger als 29 Sekunden für den Response, wirft das API Gateway einen 504 Timeout Error. Ist das der Fall, müsst ihr von synchron (Warten auf Athena) zu asynchron wechseln (Client schickt Request 
→
→ bekommt Query-ID 
→
→ Pollt später auf das Ergebnis).

The API Gateway is configured with a timeout of 29 seconds, which is the maximum allowed by AWS. 
If queries on the Athena database take longer than 29 seconds to execute, the API Gateway will return a 504 Timeout Error.
If this problem consistently occurs, a switch from synchronous to asynchronous processing may be necessary.

## AWS IoT Core

Additional Information on topic declaration found in the [docs](https://docs.aws.amazon.com/iot/latest/developerguide/iot-action-resources.html).

## AWS History Branch

### S3 Bucket

Partitioning: A too high granularity (e.g. by seconds) leads to a small file problem and 
leads to a very bad performance. So the buffering in Kinesis Firehose should be set to 5 to 15 minutes or 
until a file size of n MB is reached. The Partitioning with year/month/day would be enough.

File Format: Apache Parquet is being used as file format, guaranteeing minimal storage and good performance.

As the type of S3 bucket, the standard storage class is used, as the data is accessed and changed frequently,
the access must have low latency and high throughput, and the cost should be kept low (see [Docs](https://aws.amazon.com/de/s3/storage-classes/)).

### Athena

[AWS Athena Docs](https://docs.aws.amazon.com/athena/latest/ug/getting-started.html)

### Lambda Handle History Data

For a safe usage of Athena, the Lambda function uses [prepared statements](https://docs.aws.amazon.com/athena/latest/ug/querying-with-prepared-statements-querying.html) to prevent SQL injection and ensure that user input is properly sanitized before being included in the query execution. The query is built with parameters as limit, startDate and endDate for flexible filtering from the client side.

During the wait for a response from Athena, the Lambda function implements a polling mechanism that periodically checks the status of the query execution. The query execution status can be one of the following: QUEUED, RUNNING, SUCCEEDED, FAILED, or CANCELLED (see [Athena Query Execution States](https://docs.aws.amazon.com/athena/latest/APIReference/API_QueryExecutionStatus.html)). After a given timeout threshold (e.g., 25 seconds to stay within the API Gateway limit), if the query has not reached a terminal state (SUCCEEDED, FAILED, or CANCELLED), the Lambda function will return a timeout response to the client, indicating that the query is still processing and advising them to check back later for results.

After receiving a successful response from Athena, the Lambda function retrieves the query results and transforms them into a JSON structure that can be easily consumed by the client application. Dependent on the success or failure of the query execution, the Lambda function returns an appropriate HTTP response code (e.g., 200 for success, 500 for server error) along with a JSON body containing either the query results or error details.

The methods were fully tested with unit tests using the unittest framework and mocks.

### Glue Data Catalog

Using the Glue Feature Partition Projection, Athena can automatically calculate the time 
paths without needing to load new metadata.

[AWS Glue Docs](https://docs.aws.amazon.com/glue/latest/dg/what-is-glue.html)
[AWS Glue Data Catalog Docs](https://docs.aws.amazon.com/athena/latest/ug/data-sources-glue.html)

### Data Firehose

[AWS Firehose Docs](https://docs.aws.amazon.com/firehose/latest/dev/basic-create.html)

## etc

<!-- # BCN-2026SSTeamMagenta-Sensiq



## Getting started

To make it easy for you to get started with GitLab, here's a list of recommended next steps.

Already a pro? Just edit this README.md and make it your own. Want to make it easy? [Use the template at the bottom](#editing-this-readme)!

## Add your files

* [Create](https://docs.gitlab.com/user/project/repository/web_editor/#create-a-file) or [upload](https://docs.gitlab.com/user/project/repository/web_editor/#upload-a-file) files
* [Add files using the command line](https://docs.gitlab.com/topics/git/add_files/#add-files-to-a-git-repository) or push an existing Git repository with the following command:

```
cd existing_repo
git remote add origin https://git.oth-aw.de/bcssnmagenta26/bcn-2026ssteammagenta-sensiq.git
git branch -M main
git push -uf origin main
```

## Integrate with your tools

* [Set up project integrations](https://git.oth-aw.de/bcssnmagenta26/bcn-2026ssteammagenta-sensiq/-/settings/integrations)

## Collaborate with your team

* [Invite team members and collaborators](https://docs.gitlab.com/user/project/members/)
* [Create a new merge request](https://docs.gitlab.com/user/project/merge_requests/creating_merge_requests/)
* [Automatically close issues from merge requests](https://docs.gitlab.com/user/project/issues/managing_issues/#closing-issues-automatically)
* [Enable merge request approvals](https://docs.gitlab.com/user/project/merge_requests/approvals/)
* [Set auto-merge](https://docs.gitlab.com/user/project/merge_requests/auto_merge/)

## Test and Deploy

Use the built-in continuous integration in GitLab.

* [Get started with GitLab CI/CD](https://docs.gitlab.com/ci/quick_start/)
* [Analyze your code for known vulnerabilities with Static Application Security Testing (SAST)](https://docs.gitlab.com/user/application_security/sast/)
* [Deploy to Kubernetes, Amazon EC2, or Amazon ECS using Auto Deploy](https://docs.gitlab.com/topics/autodevops/requirements/)
* [Use pull-based deployments for improved Kubernetes management](https://docs.gitlab.com/user/clusters/agent/)
* [Set up protected environments](https://docs.gitlab.com/ci/environments/protected_environments/)

***

# Editing this README

When you're ready to make this README your own, just edit this file and use the handy template below (or feel free to structure it however you want - this is just a starting point!). Thanks to [makeareadme.com](https://www.makeareadme.com/) for this template.

## Suggestions for a good README

Every project is different, so consider which of these sections apply to yours. The sections used in the template are suggestions for most open source projects. Also keep in mind that while a README can be too long and detailed, too long is better than too short. If you think your README is too long, consider utilizing another form of documentation rather than cutting out information.

## Name
Choose a self-explaining name for your project.

## Description
Let people know what your project can do specifically. Provide context and add a link to any reference visitors might be unfamiliar with. A list of Features or a Background subsection can also be added here. If there are alternatives to your project, this is a good place to list differentiating factors.

## Badges
On some READMEs, you may see small images that convey metadata, such as whether or not all the tests are passing for the project. You can use Shields to add some to your README. Many services also have instructions for adding a badge.

## Visuals
Depending on what you are making, it can be a good idea to include screenshots or even a video (you'll frequently see GIFs rather than actual videos). Tools like ttygif can help, but check out Asciinema for a more sophisticated method.

## Installation
Within a particular ecosystem, there may be a common way of installing things, such as using Yarn, NuGet, or Homebrew. However, consider the possibility that whoever is reading your README is a novice and would like more guidance. Listing specific steps helps remove ambiguity and gets people to using your project as quickly as possible. If it only runs in a specific context like a particular programming language version or operating system or has dependencies that have to be installed manually, also add a Requirements subsection.

## Usage
Use examples liberally, and show the expected output if you can. It's helpful to have inline the smallest example of usage that you can demonstrate, while providing links to more sophisticated examples if they are too long to reasonably include in the README.

## Support
Tell people where they can go to for help. It can be any combination of an issue tracker, a chat room, an email address, etc.

## Roadmap
If you have ideas for releases in the future, it is a good idea to list them in the README.

## Contributing
State if you are open to contributions and what your requirements are for accepting them.

For people who want to make changes to your project, it's helpful to have some documentation on how to get started. Perhaps there is a script that they should run or some environment variables that they need to set. Make these steps explicit. These instructions could also be useful to your future self.

You can also document commands to lint the code or run tests. These steps help to ensure high code quality and reduce the likelihood that the changes inadvertently break something. Having instructions for running tests is especially helpful if it requires external setup, such as starting a Selenium server for testing in a browser.

## Authors and acknowledgment
Show your appreciation to those who have contributed to the project.

## License
For open source projects, say how it is licensed.

## Project status
If you have run out of energy or time for your project, put a note at the top of the README saying that development has slowed down or stopped completely. Someone may choose to fork your project or volunteer to step in as a maintainer or owner, allowing your project to keep going. You can also make an explicit request for maintainers. -->
