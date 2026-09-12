from harnest import lifecycle
from harnest.lib.personal_skills import PersonalSkills


@lifecycle.skills.source('personal')
def personal_skills():
    return PersonalSkills()
