'use strict'
const foundationFactory = require('../foundationFactory')
const logGroupFactory = require('./logGroupFactory')
const repositoryFactory = require('./repositoryFactory')
const taskDefinitionFactory = require('./taskDefinitionFactory')
const serviceFactory = require('./serviceFactory')
const {getEnvironmentName} = require('../util')

module.exports = function deploymentFactory ({environmentName = getEnvironmentName(), packageDir = process.cwd()}) {
  const {
    clusterName,
    getServiceRoleArn,
    getDefaultTargetGroupArn,
    priority,
  } = foundationFactory({environmentName})
  const repository = repositoryFactory({packageDir})
  const logGroup = logGroupFactory({name: `${environmentName}/${repository.name}`})
  const taskDefinition = taskDefinitionFactory({
    async getImageName () {
      await repository.buildImage()
      return repository.pushImage()
    },
    logGroupName: logGroup.name,
    name: `${environmentName}-${repository.name}`,
  })

  let getTargetGroupArn
  if (priority === 'default') {
    getTargetGroupArn = getDefaultTargetGroupArn
  } else {
    throw new Error(`Bad priority "${priority}"`)
  }

  const service = serviceFactory({
    clusterName,
    getServiceRoleArn,
    getTargetGroupArn,
    getTaskDefinitionId: taskDefinition.create,
    name: repository.name,
  })

  async function create () {
    await logGroup.create()
    await repository.create()
    await service.create()
  }

  async function destroy () {
    await repository.destroy()
    await logGroup.destroy()
  }

  return {
    create,
    destroy,
  }
}
