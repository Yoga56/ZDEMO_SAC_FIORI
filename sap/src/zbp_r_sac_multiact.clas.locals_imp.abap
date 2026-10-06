CLASS lhc_multiaction DEFINITION INHERITING FROM cl_abap_behavior_handler.
  PRIVATE SECTION.
    METHODS get_instance_authorizations FOR INSTANCE AUTHORIZATION
      IMPORTING keys REQUEST requested_authorizations FOR multiaction RESULT result.

    METHODS setowner FOR DETERMINE ON MODIFY
      IMPORTING keys FOR multiaction~SetOwner.
ENDCLASS.

CLASS lhc_multiaction IMPLEMENTATION.

  " the owner changes and deletes; whoever the action was shared with for editing changes it; the others can only open and run it
  METHOD get_instance_authorizations.
    DATA may_edit   TYPE if_abap_behv=>t_authorization.
    DATA may_delete TYPE if_abap_behv=>t_authorization.
    LOOP AT keys INTO DATA(key).
      may_edit   = COND #( WHEN zcl_sac_access=>can_edit( kind = 'MULTIACTION' id = key-ActionId ) = abap_true
                           THEN if_abap_behv=>auth-allowed ELSE if_abap_behv=>auth-unauthorized ).
      may_delete = COND #( WHEN zcl_sac_access=>can_delete( kind = 'MULTIACTION' id = key-ActionId ) = abap_true
                           THEN if_abap_behv=>auth-allowed ELSE if_abap_behv=>auth-unauthorized ).
      APPEND VALUE #( %tky         = key-%tky
                      %update      = may_edit
                      %delete      = may_delete
                      %assoc-_Step = may_edit ) TO result.
    ENDLOOP.
  ENDMETHOD.


  " a new multi action belongs to the user who creates it
  METHOD setowner.
    READ ENTITIES OF zr_sac_multiact IN LOCAL MODE
      ENTITY multiaction
        FIELDS ( OwnerId ) WITH CORRESPONDING #( keys )
      RESULT DATA(actions).
    DELETE actions WHERE OwnerId IS NOT INITIAL.
    CHECK actions IS NOT INITIAL.
    MODIFY ENTITIES OF zr_sac_multiact IN LOCAL MODE
      ENTITY multiaction
        UPDATE FIELDS ( OwnerId )
        WITH VALUE #( FOR a IN actions ( %tky = a-%tky OwnerId = zcl_sac_access=>user( ) ) ).
  ENDMETHOD.

ENDCLASS.
