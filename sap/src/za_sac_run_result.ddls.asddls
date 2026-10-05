@EndUserText.label: 'Run Result'
define abstract entity ZA_SAC_RUN_RESULT
{
  Changed : abap.int4,
  Status : abap.char(1),
  LogText : abap.string
}
