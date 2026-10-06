@AccessControl.authorizationCheck: #NOT_REQUIRED
@EndUserText.label: 'Current business user'
define view entity ZI_SAC_USER
  as select from I_BusinessUserBasic
{
  key BusinessPartner,
      UserID,
      PersonFullName,
      FirstName,
      LastName
}
where UserID = $session.user
